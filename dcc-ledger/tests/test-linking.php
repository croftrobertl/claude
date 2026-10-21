<?php
/** Linking stays to MotoPress bookings: code, exact, copies, and what must never link. */

declare(strict_types=1);

use DCCL\Importer;
use DCCL\Linker;
use DCCL\Mphb_Reader;
use DCCL\Repo;

T::group('Linking');

dccl_seed_mphb();

foreach ([
    'airbnb-payout.csv',
    'airbnb-reservations.csv',
    'bookingcom-reservations.csv',
    'bookingcom-payout.csv',
    'vrbo-reservations.csv',
    'vrbo-payout.csv',
    'bookingcom-invoices.csv',
] as $file) {
    Importer::run(dccl_fixture($file), $file, false, 1);
}

$counts = Linker::run(1);

T::same(1, $counts['code'], 'One Airbnb stay links by the code in its iCal summary');
T::same(4, $counts['exact'], 'Four stays link on an exact cottage and dates match');
T::same(8, $counts['copy'], 'Four hand-typed copies, plus Rob\'s four confirmed moves, are linked');

$link = Repo::import_link(Repo::stay_id('airbnb', 'HMAAAA0001'));
T::same('code', $link['method'], 'HMAAAA0001 links by code');
T::same(9001, (int) $link['mphb_booking_id'], 'And to the right booking');

$link = Repo::import_link(Repo::stay_id('airbnb', 'HMAAAA0002'));
T::same('exact', $link['method'], 'HMAAAA0002 links on exact dates, having no code');

$link = Repo::import_link(Repo::stay_id('bookingcom', '5111111111'));
T::same(9003, (int) $link['mphb_booking_id'], 'The Booking.com stay links to its imported booking');

$link = Repo::import_link(Repo::stay_id('vrbo', 'HA-AAA111'));
T::same(9004, (int) $link['mphb_booking_id'], 'The Vrbo stay links to its imported booking');

T::group('What must never link automatically');

$moved = Repo::stay_id('airbnb', 'HMMOVED001');
T::same(null, Repo::import_link($moved), 'A moved-cottage booking is never linked automatically');
$copies = array_filter(Repo::links_for_stay($moved), static fn ($l) => $l['method'] === 'copy');
T::same(0, count($copies), 'Nor is it auto-linked as a copy');

$booking_ids = [];
foreach (Repo::all_links() as $l) {
    $booking_ids[] = (int) $l['mphb_booking_id'];
}
T::ok(!in_array(9010, $booking_ids, true), 'A cancelled dock block never links');
T::ok(!in_array(9011, $booking_ids, true), 'The moved-cottage copy is left for a person');

// Cross-channel: booking 9003 is Booking.com; no Airbnb stay may take it.
$cross = false;
foreach (Repo::all_links() as $l) {
    if ((int) $l['mphb_booking_id'] !== 9003 || $l['method'] === 'copy') {
        continue;
    }
    $stay = $GLOBALS['wpdb']->get_row(
        $GLOBALS['wpdb']->prepare('SELECT channel FROM ' . DCCL\Schema::stays() . ' WHERE id = %d', (int) $l['stay_id']),
        ARRAY_A
    );
    $cross = $cross || $stay['channel'] !== 'bookingcom';
}
T::ok(!$cross, 'No link crosses channels');

// Booking #9015 is an imported Vrbo booking sharing cottage 31 and 12–15 March
// with the Airbnb stay. Only the channel separates them.
T::same(9002, (int) Repo::import_link(Repo::stay_id('airbnb', 'HMAAAA0002'))['mphb_booking_id'], 'The Airbnb stay takes the Airbnb booking, not the Vrbo one on the same dates');
$vrbo_taken = false;
foreach (Repo::all_links() as $l) {
    $vrbo_taken = $vrbo_taken || (int) $l['mphb_booking_id'] === 9015;
}
T::ok(!$vrbo_taken, 'The Vrbo booking on those dates is left alone');

// Booking #9016 overlaps stay HMNOPAY0001 (36, 15–18 Aug) without matching it.
T::same(null, Repo::import_link(Repo::stay_id('airbnb', 'HMNOPAY0001')), 'An overlapping booking is never linked automatically');
$overlap_taken = false;
foreach (Repo::all_links() as $l) {
    $overlap_taken = $overlap_taken || (int) $l['mphb_booking_id'] === 9016;
}
T::ok(!$overlap_taken, 'The overlapping booking stays unlinked');

T::group('Hand-typed copies');

$copy_ids = [];
foreach (Repo::all_links() as $l) {
    if ($l['method'] === 'copy') {
        $copy_ids[] = (int) $l['mphb_booking_id'];
    }
}
sort($copy_ids);
T::same(
    [1152, 7278, 9006, 9013, 9014, 12443, 12447, 17462],
    $copy_ids,
    'Copies are found by matching dates, by a code in a note, and by Rob\'s own confirmation'
);

// 8415 and 9136 are NOT among them: their platform stay is cancelled with
// nothing on it, so the guest cancelled and paid Rob direct.
T::ok(!in_array(8415, $copy_ids, true), 'A booking whose platform stay was cancelled and unpaid is not a copy');
T::ok(!in_array(9136, $copy_ids, true), 'Nor the second one');

$by_code = Repo::links_for_stay(Repo::stay_id('bookingcom', '5222222222'));
T::same(9013, (int) $by_code[0]['mphb_booking_id'], 'A copy with different dates is found by "Booking.com ID:" in its note');

$mislabelled = Repo::links_for_stay(Repo::stay_id('vrbo', 'HA-AAA111'));
$found = false;
foreach ($mislabelled as $l) {
    $found = $found || ((int) $l['mphb_booking_id'] === 9014 && $l['method'] === 'copy');
}
T::ok($found, 'A Vrbo code mislabelled as "Airbnb ID: HA-…" is still matched');

T::group('Code extraction keeps only the code');

$codes = Mphb_Reader::codes_in('Moved from Booking.com ID: 5222222222 for Ann Beaulieu, phone 352-555-0199');
T::same(1, count($codes), 'One code found in a note');
T::same('5222222222', $codes[0]['code'], 'Only the code is returned');
T::ok(!str_contains((string) json_encode($codes), 'Beaulieu'), 'The name in the note is not returned');
T::ok(!str_contains((string) json_encode($codes), '352-555'), 'The phone number in the note is not returned');

T::group('Linking is idempotent');

$again = Linker::run(1);
T::same(0, $again['code'], 'Running it twice adds no code links');
T::same(0, $again['exact'], 'Running it twice adds no exact links');
T::same(0, $again['copy'], 'Running it twice adds no copy links');

T::group('Manual links');

$stay = Repo::stay_id('airbnb', 'HMMOVED001');
T::ok(Repo::link($stay, 9011, 'manual', 1), 'A person can link the moved booking by hand');
T::same('manual', Repo::import_link($stay)['method'], 'It is stored as a manual link');
T::ok(!Repo::link($stay, 9012, 'manual', 1), 'A stay cannot take a second import link');
T::ok(Repo::link($stay, 9012, 'copy', 1), 'But it can take any number of copy links');

$link_id = (int) Repo::import_link($stay)['id'];
T::ok(Repo::unlink($link_id), 'A manual link can be removed');
T::same(null, Repo::import_link($stay), 'And the stay is unlinked again');
