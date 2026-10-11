<?php
/**
 * STAFF SEARCH (0.45.0): what is searched, how it matches, what it returns,
 * and the gate in front of it.
 *
 *   WHAT: every visible booking, over what its sheet shows — never the
 *   Photo ID, never a cancelled booking — plus the booking number, the
 *   cottage and the sync text with its literal quotes stripped.
 *   HOW: exact / prefix / substring from 2 characters; typo and sound from 4;
 *   booking number, date, phone digits and country name readings.
 *   RETURNS: summary rows and a plain-text "why", best first, no cap.
 *   GATE: 403 and an empty body before anything is read (child process);
 *   POST only; the query never logged or stored.
 */
namespace MPHBAC {
    // Staff_Search and Staff_Data are namespaced, so their unqualified
    // error_log() resolves here first: every line either writes is captured.
    function error_log($m) { $GLOBALS['t_logs'][] = (string) $m; return true; }
}

namespace {
    $GLOBALS['t_auth'] = true;
    $GLOBALS['t_logs'] = [];
    $GLOBALS['t_transients'] = [];
    $GLOBALS['t_status'] = null;
    function is_user_logged_in() { return $GLOBALS['t_auth']; }
    function current_user_can($c, ...$a) { return $GLOBALS['t_auth']; }
    function post_password_required($p = null) { return true; }
    function wp_verify_nonce($n, $a) { return $n === 'good' ? 1 : false; }
    function nocache_headers() {}
    function status_header($code) { $GLOBALS['t_status'] = $code; }
    function wp_unslash($v) { return $v; }
    function get_transient($k) { return $GLOBALS['t_transients'][$k] ?? false; }
    function set_transient($k, $v, $t = 0) { $GLOBALS['t_transients'][$k] = $v; $GLOBALS['t_set'][] = [$k, $t]; return true; }
    function delete_transient($k) { unset($GLOBALS['t_transients'][$k]); return true; }
    function _prime_post_caches($ids, $terms = true, $meta = false) {}
    function update_meta_cache($type, $ids) {}
    function get_edit_post_link($id, $c = '') { return ''; }
    function remove_accents($s) { return strtr($s, ['é' => 'e', 'è' => 'e', 'ö' => 'o', 'ü' => 'u', 'ñ' => 'n']); }
    class T_Json extends \Exception { public $payload; public $code_; }
    function wp_send_json_success($d = null) { $e = new T_Json('ok'); $e->payload = $d; throw $e; }
    function wp_send_json_error($d = null, $c = 200) { $e = new T_Json('err'); $e->payload = $d; $e->code_ = $c; throw $e; }

    /* MPHB, so the notes come through the entity as on live. */
    class T_Booking {
        public $id;
        public function __construct($id) { $this->id = $id; }
        public function getNote() { return $GLOBALS['t_note'][$this->id] ?? ''; }
        public function getInternalNotes() { return $GLOBALS['t_inotes'][$this->id] ?? []; }
    }
    class T_Repo { public function findById($id) { return isset($GLOBALS['t_posts'][$id]) ? new T_Booking($id) : null; } }
    class T_MPHB { public function getBookingRepository() { return new T_Repo(); } }
    function MPHB() { return new T_MPHB(); }

    require __DIR__ . '/bootstrap.php';
    $ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
    require $ROOT . '/includes/class-settings.php';
    require $ROOT . '/includes/class-cache.php';
    require $ROOT . '/includes/class-data-provider.php';
    require $ROOT . '/includes/class-staff.php';
    require $ROOT . '/includes/class-staff-data.php';
    require $ROOT . '/includes/class-staff-search.php';

    use MPHBAC\Staff;
    use MPHBAC\Staff_Search;

    /* ---- the fixture: six bookings, one cancelled ---------------------- */
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22: Blue Heron', ['mphb_adults_capacity' => 4]);
    t_post(23, 'mphb_room_type', 'publish', 'Cottage 23: Kingfisher', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R22', ['mphb_room_type_id' => 22]);
    t_post(230, 'mphb_room', 'publish', 'R23', ['mphb_room_type_id' => 23]);
    $book = static function (int $id, string $status, string $in, string $out, int $room, array $meta) {
        t_post($id, 'mphb_booking', $status, 'B', $meta + ['mphb_check_in_date' => $in, 'mphb_check_out_date' => $out, 'mphb_total_price' => 0]);
        t_post($id * 10, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => $room, '_mphb_adults' => 2]);
        $GLOBALS['t_posts'][$id * 10]->post_parent = $id;
    };
    $book(101, 'confirmed', '2026-12-20', '2026-12-27', 220, ['mphb_first_name' => 'Ann', 'mphb_last_name' => 'Smith',
        'mphb_phone' => '+1 (555) 010-4421', 'mphb_email' => 'ann@example.com', 'mphb_country' => 'US', 'mphb_city' => 'Dora',
        'mphb_apartment_units' => '4B', 'mphb_boat' => 'Yes',
        'mphb_upload_id' => 'wp-content/uploads/mphb_protected_uploads/secretfile.jpg']);
    $GLOBALS['t_note'][101] = 'Late arrival, around 11pm';
    $GLOBALS['t_inotes'][101] = [['note' => 'Bringing a kayak', 'date' => '2026-10-01 10:00', 'user' => 'Rob']];
    $book(102, 'confirmed', '2026-10-05', '2026-10-08', 230, ['mphb_first_name' => 'Jon', 'mphb_last_name' => 'Smyth',
        'mphb_phone' => '555-222-3333', 'mphb_country' => 'CA',
        'mphb_ical_prodid' => '-//Airbnb Inc//Hosting Calendar 0.8.8//EN', 'mphb_ical_summary' => '"Reserved"',
        'mphb_ical_description' => '"https://www.airbnb.com/hosting/reservations/details/HMABC123 Phone Number (Last 4 Digits): 9876"']);
    $book(103, 'cancelled', '2026-10-01', '2026-10-04', 220, ['mphb_first_name' => 'Bob', 'mphb_last_name' => 'Jones']);
    $book(104, 'confirmed', '2024-12-23', '2024-12-26', 230, ['mphb_ical_prodid' => '-//HomeAway.com, Inc.//NONSGML HomeAway Calendar//EN',
        'mphb_ical_summary' => '"Reserved - Carla"']);
    $book(105, 'confirmed', '2021-07-01', '2021-07-05', 220, ['mphb_first_name' => 'Dee', 'mphb_last_name' => 'March']);
    // "Dec 24" as WORDS would find this note ("Deck", "24th"); as a date, not.
    $GLOBALS['t_note'][105] = 'Deck chairs out by the 24th';
    $book(106, 'pending', '2027-03-14', '2027-03-17', 230, ['mphb_first_name' => 'Eve', 'mphb_last_name' => 'Long']);
    $book(107, 'confirmed', '2025-06-01', '2025-06-04', 220, ['mphb_first_name' => 'Kim', 'mphb_last_name' => 'Fillips']);

    /* 0.45.1, the Website Director's staging cases: cottages 32 and 33 beside
       22 and 23 (one of them "The Boathouse"), a 5-digit booking number, a
       booking whose number is also a cottage's, Novembers past and upcoming,
       and guests whose names a loose sound match took for "boat" (Bodie, BT)
       and "boathouse" (Betsy, B320). The upcoming November is worked out from
       today, so "nearest upcoming first" never goes stale. */
    // Post ids 9032 / 9033: the cottage NUMBER comes from the title, and post
    // id 32 is booking #32 below (a shared id once overwrote a room type).
    t_post(9032, 'mphb_room_type', 'publish', 'Cottage 32: The Boathouse', ['mphb_adults_capacity' => 4]);
    t_post(9033, 'mphb_room_type', 'publish', 'Cottage 33: Osprey', ['mphb_adults_capacity' => 4]);
    t_post(3200, 'mphb_room', 'publish', 'R32', ['mphb_room_type_id' => 9032]);
    t_post(3300, 'mphb_room', 'publish', 'R33', ['mphb_room_type_id' => 9033]);
    $nowY = (int) date('Y');
    $NOV = date('Y-m-d') < "$nowY-11-05" ? $nowY : $nowY + 1;       // the next November stay
    $book(108, 'confirmed', "$NOV-11-02", "$NOV-11-05", 3200, ['mphb_first_name' => 'Gus', 'mphb_last_name' => 'Hale']);
    $book(109, 'confirmed', ($NOV - 3) . '-11-28', ($NOV - 3) . '-12-02', 3300, ['mphb_first_name' => 'Bodie', 'mphb_last_name' => 'Hart',
        'mphb_phone' => '555-777-2323']);
    $book(19600, 'confirmed', ($NOV + 1) . '-01-10', ($NOV + 1) . '-01-13', 230, ['mphb_first_name' => 'Betsy', 'mphb_last_name' => 'Novak']);
    $book(32, 'confirmed', '2020-01-01', '2020-01-03', 220, ['mphb_first_name' => 'Lou', 'mphb_last_name' => 'Park']);
    // A LATER upcoming November: latest-first would put it before 108.
    $book(111, 'confirmed', ($NOV + 1) . '-11-20', ($NOV + 1) . '-11-22', 220, ['mphb_first_name' => 'Ida', 'mphb_last_name' => 'Ross']);

    $fail = 0;
    function check(string $l, bool $c, $x = null): void {
        global $fail;
        echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
        if (!$c) { $fail++; }
    }
    $ids = static fn(array $r): array => array_map(static fn($x) => $x['id'], $r);
    $find = static fn(string $q): array => Staff_Search::search($q);

    /* ---- the child: an UNAUTHORIZED search ------------------------------ */
    if (getenv('T_SEARCH_CHILD') === '1' || getenv('T_SEARCH_CHILD') === 'get') {
        // '1': unauthorized POST. 'get': AUTHORIZED, but a GET.
        $GLOBALS['t_auth'] = getenv('T_SEARCH_CHILD') === 'get';
        $_SERVER['REQUEST_METHOD'] = getenv('T_SEARCH_CHILD') === 'get' ? 'GET' : 'POST';
        $_POST = $_REQUEST = ['q' => 'Smith', 'nonce' => 'good'];
        register_shutdown_function(static function () {
            fwrite(STDERR, json_encode(['status' => $GLOBALS['t_status'], 'indexed' => isset($GLOBALS['t_transients'][Staff_Search::INDEX_KEY])]));
        });
        Staff::handle_search();
        fwrite(STDERR, 'REACHED THE END');
        exit(0);
    }

    echo "-- what is searched: the sheet, the number, the cottage, the sync text --\n";
    $index = Staff_Search::index();
    check('every VISIBLE booking is indexed, the cancelled one is not', count($index) === 11 && !in_array(103, $ids($index), true), $ids($index));
    $f101 = array_column($index[array_search(101, $ids($index), true)]['fields'], 1, 0);
    check('the sheet\'s rows: name, phone, apartment / unit, Boat, the customer note and the internal note',
        ($f101['First Name'] ?? '') === 'Ann' && isset($f101['Phone']) && ($f101['Apartment / Unit'] ?? '') === '4B'
        && ($f101['Boat'] ?? '') === 'Yes' && str_contains($f101['Customer Note'] ?? '', 'Late arrival')
        && count(array_filter(array_keys($f101), static fn($k) => str_contains($k, 'Rob'))) === 1, $f101);
    check('the cottage, by number and name', str_contains($f101['Cottage'] ?? '', 'Blue Heron'), $f101['Cottage'] ?? null);
    $all101 = json_encode($index[array_search(101, $ids($index), true)]);
    check('NEVER the Photo ID: the protected file\'s name is nowhere in the index', !str_contains($all101, 'secretfile'));
    $f102 = array_column($index[array_search(102, $ids($index), true)]['fields'], 1, 0);
    $sync = array_values(array_filter($index[array_search(102, $ids($index), true)]['fields'], static fn($f) => $f[0] === 'Sync text'));
    check('the sync text — summary AND description — with the literal quotes stripped',
        count($sync) === 2 && $sync[0][1] === 'Reserved' && str_starts_with($sync[1][1], 'https://www.airbnb.com') && !str_ends_with($sync[1][1], '"'), $sync);

    echo "\n-- 2 characters: exact, prefix, substring --\n";
    $r = $find('sm');
    check('"sm": every name starting Sm — Smith and Smyth', in_array(101, $ids($r), true) && in_array(102, $ids($r), true), $ids($r));
    $r = $find('4b');
    check('"4b": the apartment / unit', $ids($r) === [101], $ids($r));
    check('a single character finds nothing', $find('s') === []);

    echo "\n-- from 4 characters: typos and sound --\n";
    $r = $find('Smith');
    check('"Smith": Ann Smith FIRST (exact), Jon Smyth after it (sounds alike)', $ids($r) === [101, 102], array_map(static fn($x) => [$x['id'], $x['why']], $r));
    check('...and Smyth says why: "Last Name sounds like Smyth" or close to it',
        preg_match('/Last Name (sounds like|close to) Smyth/', $r[1]['why']) === 1, $r[1]['why']);
    $r = $find('Smoth');
    check('"Smoth" (a typo): Smith found, "close to Smith"', in_array(101, $ids($r), true) && str_contains($r[0]['why'], 'Smith'), array_map(static fn($x) => [$x['id'], $x['why']], $r));
    $r = $find('kayk');
    check('"kayk": the internal note\'s "kayak"', $ids($r) === [101], $ids($r));
    check('"Jones": the cancelled booking is never found — and "Jon" is not a typo of it', $find('Jones') === []);
    $r = $find('Philips');
    check('"Philips": found by SOUND alone — "Fillips" (same Metaphone; too far apart to be a typo)',
        $ids($r) === [107] && str_contains($r[0]['why'], 'sounds like Fillips'), array_map(static fn($x) => [$x['id'], $x['why']], $r));
    check('every word must match: "ann jon" finds nobody (Ann has no Jon, Jon has no Ann)', $find('ann jon') === []);

    echo "\n-- the readings: number, date, phone, country --\n";
    $r = $find('#101');
    check('"#101": that booking, first, "booking #101"', ($r[0]['id'] ?? 0) === 101 && $r[0]['why'] === 'booking #101', $r[0] ?? null);
    $r = $find('Dec 24');
    check('"Dec 24": every stay that includes that night, any year — Ann (2026) and Carla (2024)', $ids($r) == [101, 104] || (count($r) === 2 && in_array(104, $ids($r), true) && in_array(101, $ids($r), true)), $ids($r));
    check('...saying "stay includes Dec 24"', $r[0]['why'] === 'stay includes Dec 24', $r[0]['why']);
    check('"12/24" reads the same (month / day wins over Dec 2024)', $ids($find('12/24')) == $ids($r));
    check('"2026-12-24": that one night — Ann only', $ids($find('2026-12-24')) === [101]);
    check('"12/24/2024": Carla only', $ids($find('12/24/2024')) === [104]);
    check('"12/2024": the month — Carla', $ids($find('12/2024')) === [104]);
    check('"Dec 27": the check-out day is not a night of the stay — nobody', $find('Dec 27') === []);
    $r = $find('4421');
    check('"4421": the last four of a phone, "phone ends 4421"', ($r[0]['id'] ?? 0) === 101 && $r[0]['why'] === 'phone ends 4421', $r[0] ?? null);
    check('"(555) 010-4421": formatting ignored', ($find('(555) 010-4421')[0]['id'] ?? 0) === 101);
    check('"9876": the last four in Airbnb\'s description text', in_array(102, $ids($find('9876')), true));
    check('"United States": the code US', $ids($find('United States')) === [101]);
    check('"canada": CA', $ids($find('canada')) === [102]);
    check('the board\'s own wording is not indexed: "count" and "provided" find nobody (an import\'s "count not provided by …", 0.45.2)',
        $find('count') === [] && $find('provided') === [], [$ids($find('count')), $ids($find('provided'))]);
    check('"HMABC123": the Airbnb reservation code in the sync text', $ids($find('HMABC123')) === [102]);
    check('"Carla": a Vrbo summary\'s first name', $ids($find('Carla')) === [104]);
    check('"late arrival": a phrase from the customer note', ($find('late arrival')[0]['id'] ?? 0) === 101);
    check('"secretfile": the Photo ID is never searched', $find('secretfile') === []);

    echo "\n-- 0.45.1: a number is never a sound or a typo --\n";
    $whys = static fn(array $r): array => array_map(static fn($x) => $x['id'] . ' ' . $x['why'], $r);
    $r = $find('19600');
    check('"19600": that booking and nothing else (was: every booking, "Check-in sounds like 19600")', $ids($r) === [19600] && $r[0]['why'] === 'booking #19600', $whys($r));
    check('"#19600": the same', $ids($find('#19600')) === [19600]);
    $r = $find('2323');
    check('"2323": the phone that ends 2323, nothing else', $ids($r) === [109] && $r[0]['why'] === 'phone ends 2323', $whys($r));
    $bad = [];
    foreach (['19600', '2323', '7972', '2026', '1102', '23', '#23', 'c23', '33', '555'] as $nq) {
        foreach ($find($nq) as $x) {
            if (!preg_match('/^(booking #|cottage #|phone )/', $x['why'])) { $bad[] = "$nq → " . $x['why']; }
        }
    }
    check('a number only ever matches a booking, a cottage or a phone — never "sounds like" or "close to"', $bad === [], $bad);
    $r = $find('hmabc124');
    check('a word with digits in it is not typo-matched either ("hmabc124" is not HMABC123)', $r === [], $whys($r));

    echo "\n-- 0.45.1: a month name on its own is a date --\n";
    $r = $find('november');
    check('"november": the stays over a November, nearest upcoming first — and no "Sync text close to Number"',
        $ids($r) === [108, 111, 109] && $r[0]['why'] === 'stay in November', $whys($r));
    $r = $find('nov');
    check('"nov": the same stays first, then the text match (Novak) below them', $ids($r) === [108, 111, 109, 19600]
        && str_contains($r[3]['why'], 'Novak'), $whys($r));
    check('"Nov." reads the same', $ids($find('Nov.')) === [108, 111, 109, 19600]);

    echo "\n-- 0.45.1: cottage numbers --\n";
    $c23 = [106, 19600, 102, 104];            // cottage 23's stays, latest first
    foreach (['23', '#23', 'c23', 'C 23', 'cottage 23', 'Cottage #23'] as $cq) {
        $r = $find($cq);
        check("\"$cq\": exactly cottage 23's stays first, never 22, 32 or 33's; then a phone with 23 in it",
            array_slice($ids($r), 0, 4) === $c23 && array_slice($ids($r), 4) === [109]
            && $r[0]['why'] === 'cottage #23' && str_starts_with($r[4]['why'], 'phone'), $whys($r));
    }
    $r = $find('32');
    check('"32": cottage 32\'s stay first, then booking #32 (it exists), then a phone with 32 in it',
        $ids($r) === [108, 32, 109] && $r[1]['why'] === 'booking #32', $whys($r));
    $r = $find('c32');
    check('"c32": the cottage only — "c" asks for a cottage, not booking #32', $ids($r) === [108, 109], $whys($r));
    check('"c99": no cottage 99 — nothing', $find('c99') === []);

    echo "\n-- 0.45.1: sounds-like, tightened; Boat: Yes first --\n";
    $r = $find('boat');
    check('"boat": Boat: Yes first, then The Boathouse — and not Bodie (who only shares the key BT)',
        $ids($r) === [101, 108] && $r[0]['why'] === 'Boat: Yes', $whys($r));
    $r = $find('boathouse');
    check('"boathouse": The Boathouse only — not Betsy (Soundex B320 alone)', $ids($r) === [108], $whys($r));
    check('typos still work: "Bodey" finds Bodie', $ids($find('Bodey')) === [109]);
    $r = $find('Smithson');
    check('words of clearly different length are not typos: "Smithson" is not Smith (Jaro-Winkler alone says 0.93)', $r === [], $whys($r));
    check('...and sound still works: "Phillips" finds Fillips', $ids($find('Phillips')) === [107]);

    echo "\n-- what comes back --\n";
    $r = $find('sm');
    $keys = array_keys($r[0]);
    sort($keys);
    check('summary rows only: name, cottages, dates, status, source, why (and the score)',
        $keys === ['checkin', 'checkout', 'cottages', 'id', 'name', 'score', 'sourceKey', 'sourceName', 'status', 'statusLabel', 'why'], $keys);
    check('no email, phone or note leaks into a row that did not match on it',
        !str_contains(json_encode($r), 'example.com') && !str_contains(json_encode($r), 'kayak'), $r);
    $many = $find('cottage');
    check('no cap: "cottage" (in every stay\'s cottage) brings back all eleven visible bookings', count($many) === 11, $ids($many));

    echo "\n-- the index: built once, cleared on a booking change --\n";
    $GLOBALS['t_transients'] = []; $GLOBALS['t_set'] = []; t_reset();
    $find('Smith'); $find('Smyth'); $find('4421');
    $built = array_values(array_filter($GLOBALS['t_set'] ?? [], static fn($x) => $x[0] === Staff_Search::INDEX_KEY));
    check('three searches build the index ONCE', count($built) === 1, $GLOBALS['t_set'] ?? []);
    check('...in a transient WITH an expiry, so it is never autoloaded', ($built[0][1] ?? 0) > 0, $built[0] ?? null);
    Staff_Search::flush_if_booking(5, (object) ['post_type' => 'page']);
    check('deleting a page does not clear it', isset($GLOBALS['t_transients'][Staff_Search::INDEX_KEY]));
    $GLOBALS['t_transients']['mphbac_staff_search_v1'] = ['0.45.0 shape'];
    Staff_Search::flush_if_booking(101, (object) ['post_type' => 'mphb_booking']);
    check('deleting a booking does', !isset($GLOBALS['t_transients'][Staff_Search::INDEX_KEY]));
    check('...and clears 0.45.0\'s index too (a different shape, still holding guest details)', !isset($GLOBALS['t_transients']['mphbac_staff_search_v1']));
    $plugin = file_get_contents($ROOT . '/includes/class-plugin.php');
    foreach (['mphb_create_booking_via_ical', 'mphb_update_booking_via_ical', 'save_post_mphb_booking', 'save_post_mphb_payment', 'mphb_booking_status_changed'] as $hook) {
        check("cleared on $hook", (bool) preg_match("/add_action\\('$hook', \\['\\\\\\\\MPHBAC\\\\\\\\Staff_Search', 'flush'\\]\\)/", $plugin));
    }
    check('cleared on deleted_post (bookings only)', (bool) preg_match("/add_action\\('deleted_post', \\['\\\\\\\\MPHBAC\\\\\\\\Staff_Search', 'flush_if_booking'\\], 10, 2\\)/", $plugin));
    check('uninstall removes it with every mphbac_ transient', str_starts_with(Staff_Search::INDEX_KEY, 'mphbac_')
        && str_contains(file_get_contents($ROOT . '/uninstall.php'), "esc_like('_transient_mphbac_')"));

    echo "\n-- the gate, POST only, and the query never kept --\n";
    {
        $spec = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open([PHP_BINARY, __FILE__], $spec, $pipes, null, ['T_SEARCH_CHILD' => '1'] + getenv());
        $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
        proc_close($proc);
        $c = json_decode($err, true);
        check('an unauthorized search: 403', ($c['status'] ?? null) === 403, $err);
        check('...with an EMPTY body', $out === '', strlen($out) . ' bytes');
        check('...and the index is never even built for it', ($c['indexed'] ?? true) === false, $c);
        check('(instrument check) the handler stopped at the gate', !str_contains($err, 'REACHED THE END'));
    }
    $ask = static function (string $method, array $post) {
        $_SERVER['REQUEST_METHOD'] = $method;
        $_POST = $_REQUEST = $post + ['nonce' => 'good'];
        $GLOBALS['t_status'] = null;
        try { Staff::handle_search(); } catch (T_Json $e) { return [$e->getMessage(), $e->payload]; }
        return ['none', $GLOBALS['t_status']];
    };
    $r = $ask('POST', ['q' => 'Smith']);
    check('an authorized POST is answered: results and a count', $r[0] === 'ok' && $r[1]['count'] === 2, $r);
    $GLOBALS['t_logs'] = [];
    $before = json_encode($GLOBALS['t_transients']);
    $ask('POST', ['q' => 'Kingfisher4421unique']);
    check('THE QUERY IS NEVER LOGGED', !array_filter($GLOBALS['t_logs'], static fn($l) => str_contains($l, 'Kingfisher4421unique')), $GLOBALS['t_logs']);
    check('...and never stored, in any transient key or value', !str_contains(json_encode($GLOBALS['t_transients']), 'Kingfisher4421unique')
        && !str_contains(json_encode(array_keys($GLOBALS['t_transients'])), 'Kingfisher4421unique'));
    check('a query over 100 characters is cut, not refused', is_array($find(str_repeat('a', 300))));
    {
        // In a child: a refused request ends in exit, which would end this
        // suite too — silently, with exit code 0 (the first version did).
        $spec = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open([PHP_BINARY, __FILE__], $spec, $pipes, null, ['T_SEARCH_CHILD' => 'get'] + getenv());
        $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
        proc_close($proc);
        $c = json_decode(preg_replace('/REACHED THE END$/', '', $err), true);
        check('a GET is refused (405) even when authorized — POST only — with an empty body',
            ($c['status'] ?? null) === 405 && $out === '' && !str_contains($err, 'REACHED THE END'), [$err, strlen($out)]);
    }
    $GLOBALS['t_reached_end'] = true;

    // (instrument check) every check above actually ran — a handler's exit
    // must never end this file early and pass by saying nothing.
    check('(instrument check) the suite ran to its end', !empty($GLOBALS['t_reached_end']));
    echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
    exit($fail ? 1 : 0);
}
