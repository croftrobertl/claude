<?php
/**
 * 0.32.0 — "ONLY SHOW INFORMATION THAT'S ACTUALLY RECEIVED OR ENTERED INTO
 * THE BOOKING." The owner's rule, applied to the /staff/ booking panel.
 *
 * The reference case throughout is booking #18433: a Booking.com import,
 * Cottage 22, 2026-09-20 -> 09-27, whose real stored state is
 *   mphb_upload_id ""   mphb_total_price 0   mphb_email ""
 *   guest2/3/4_* ""     dog_type ""          dog_size "10-20 lbs"
 *   dog_hair "short-haired"                  _mphb_adults 4
 * The last three are DEFAULTS, not answers, which is the whole difficulty.
 */
require __DIR__ . '/bootstrap.php';

$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
// Data_Provider and Staff are pulled in for the room-type list and the status
// whitelist; Cache needs a transient pair.
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';

use MPHBAC\Staff_Data;

$fail = 0;
function check(string $label, bool $cond, $extra = null): void {
    global $fail;
    echo ($cond ? 'PASS  ' : 'FAIL  ') . $label
       . ($extra !== null ? '   [' . (is_string($extra) ? $extra : json_encode($extra)) . ']' : '') . "\n";
    if (!$cond) { $fail++; }
}

/** Labels present in a section, for readable assertions. */
function labels(array $detail, string $section): array {
    return array_map(static fn($r) => $r['label'], $detail['sections'][$section] ?? []);
}
function value_of(array $detail, string $section, string $label): ?string {
    foreach ($detail['sections'][$section] ?? [] as $r) {
        if ($r['label'] === $label) { return $r['value'] ?? ''; }
    }
    return null;
}

/**
 * Build a booking. $meta is merged over the #18433 baseline, so each test
 * states only what it changes.
 */
function booking(int $id, array $meta = [], array $opts = []): array {
    $GLOBALS['t_posts'] = [];
    $GLOBALS['t_meta']  = [];
    // the cottage, with MotoPress's configured capacity
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'Cottage 22 room', ['mphb_room_type_id' => 22]);
    t_post($id, 'mphb_booking', 'confirmed', 'Booking', array_merge([
        'mphb_check_in_date'  => '2026-09-20',
        'mphb_check_out_date' => '2026-09-27',
        'mphb_total_price'    => 0,
        'mphb_upload_id'      => '',
        'mphb_email'          => '',
        'mphb_first_name'     => 'Dana',
        'mphb_last_name'      => 'Reyes',
        'mphb_guest2_first_name' => '',
        'mphb_guest2_last_name'  => '',
        'mphb_guest3_first_name' => '',
        'mphb_guest4_last_name'  => '',
        'mphb_dog_type'       => '',
        'mphb_dog_size'       => '10-20 lbs',
        'mphb_dog_hair'       => 'short-haired',
        'mphb_ical_prodid'    => '-//Booking.com//Bookings Calendar//EN',
    ], $meta));
    // the reserved room, carrying _mphb_adults and any services
    $rr = $id + 1;
    t_post($rr, 'mphb_reserved_room', 'publish', 'RR', array_merge([
        '_mphb_room_id' => 220,
        '_mphb_adults'  => $opts['adults'] ?? 4,
    ], isset($opts['services']) ? ['_mphb_services' => $opts['services']] : []));
    $GLOBALS['t_posts'][$rr]->post_parent = $id;
    foreach ($opts['service_posts'] ?? [] as $sid => $title) {
        t_post($sid, 'mphb_room_service', 'publish', $title);
    }
    return Staff_Data::booking_detail($id);
}

echo "-- the reference booking, #18433 as stored --\n";
$d = booking(18433);
check('detail is returned at all', is_array($d));
check('1: NO "Photo ID" row when mphb_upload_id is empty',
    !in_array('Photo ID', labels($d, 'customer'), true), labels($d, 'customer'));
check('2: NO Total row when the booking carries no price',
    !in_array('Total', labels($d, 'booking'), true), labels($d, 'booking'));
check('2: NO Paid row either', !in_array('Paid', labels($d, 'booking'), true));
check('2: NO Balance Due row — a zero balance on an OTA import is a fact about an empty field',
    !in_array('Balance Due', labels($d, 'booking'), true));
check('3: NO Email row when the stored email is empty',
    !in_array('Email', labels($d, 'customer'), true));
check('3: NO guest 2/3/4 rows when those names are empty',
    !array_filter(labels($d, 'customer'), static fn($l) => str_starts_with($l, 'Guest')), labels($d, 'customer'));
check('5: NO pet rows — dog_type is empty and there is no pet fee',
    !array_filter(labels($d, 'customer'), static fn($l) => str_starts_with($l, 'Dog')), labels($d, 'customer'));
check('4: guest count stays honest when _mphb_adults equals capacity on an import',
    str_contains((string) value_of($d, 'booking', 'Number of Guests'), 'not provided'),
    value_of($d, 'booking', 'Number of Guests'));
check('what IS entered still shows: the guest name and the dates',
    value_of($d, 'customer', 'First Name') === 'Dana'
    && value_of($d, 'booking', 'Check-in') === '2026-09-20', labels($d, 'booking'));

echo "\n-- 1: a real photo ID must still appear --\n";
$d = booking(18434, ['mphb_upload_id' => '904']);
check('1: the Photo ID row returns when a file is actually attached',
    in_array('Photo ID', labels($d, 'customer'), true), labels($d, 'customer'));
$d = booking(18435, ['mphb_upload_id' => '0']);
check('1: ...but "0" is not an attachment', !in_array('Photo ID', labels($d, 'customer'), true));

echo "\n-- 2: money appears only when money is owed --\n";
$d = booking(18436, ['mphb_total_price' => 1200]);
check('2: a priced booking with no payment recorded owes the full total, so all three rows show',
    in_array('Total', labels($d, 'booking'), true)
    && in_array('Paid', labels($d, 'booking'), true)
    && in_array('Balance Due', labels($d, 'booking'), true), labels($d, 'booking'));
check('2: ..."No payment recorded" is not mistaken for "owes nothing"',
    value_of($d, 'booking', 'Paid') === 'No payment recorded', value_of($d, 'booking', 'Paid'));

echo "\n-- 4: a real count on an imported booking is NOT hidden --\n";
$d = booking(18437, [], ['adults' => 2]);
check('4: two adults in a four-capacity cottage is a figure somebody entered, so it shows',
    value_of($d, 'booking', 'Number of Guests') === '2', value_of($d, 'booking', 'Number of Guests'));
$d = booking(18438, ['mphb_number_of_guests' => '3']);
check('4: a WP-Admin override wins even when _mphb_adults still equals capacity',
    value_of($d, 'booking', 'Number of Guests') === '3', value_of($d, 'booking', 'Number of Guests'));
$d = booking(18439, ['mphb_number_of_guests' => '0']);
check('4: ...but a zero override is not an answer',
    str_contains((string) value_of($d, 'booking', 'Number of Guests'), 'not provided'),
    value_of($d, 'booking', 'Number of Guests'));

echo "\n-- 5: the pet block, across both eras of the form --\n";
$d = booking(18440, ['mphb_dog_type' => 'Beagle']);
check('5: a typed dog_type shows the whole block, defaults included',
    in_array('Dog Type', labels($d, 'customer'), true)
    && in_array('Dog Size', labels($d, 'customer'), true)
    && in_array('Dog Hair', labels($d, 'customer'), true), labels($d, 'customer'));
$d = booking(18441, [], ['services' => [77 => 1], 'service_posts' => [77 => 'Pet Fee']]);
check('5: a pet FEE shows the block even with dog_type empty — the historical case',
    in_array('Dog Size', labels($d, 'customer'), true), labels($d, 'customer'));
$d = booking(18442, [], ['services' => [78 => 1], 'service_posts' => [78 => 'Early Check-in']]);
check('5: a non-pet service does NOT show it',
    !array_filter(labels($d, 'customer'), static fn($l) => str_starts_with($l, 'Dog')), labels($d, 'customer'));
check('5: and the defaults alone never show it — the trap this rule exists for',
    !in_array('Dog Size', labels(booking(18443), 'customer'), true));

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
