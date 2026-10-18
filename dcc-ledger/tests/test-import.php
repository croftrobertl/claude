<?php
/** Importing: counts, idempotency, derived tax, undo, exclusions. */

declare(strict_types=1);

use DCCL\Batches;
use DCCL\Importer;
use DCCL\Repo;
use DCCL\Schema;

T::group('Importing');

global $wpdb;

$result = Importer::run(dccl_fixture('airbnb-payout.csv'), 'airbnb-payout.csv', true, 1);
T::ok($result['ok'], 'A dry run succeeds');
T::same(6, $result['counts']['stays_new'], 'The dry run reports the stays it would add');
T::same(0, (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::stays()), 'A dry run writes no stays');
T::same(0, (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::lines()), 'A dry run writes no money lines');
T::same(0, (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::batches()), 'A dry run writes no batch');

$result = Importer::run(dccl_fixture('airbnb-payout.csv'), 'airbnb-payout.csv', false, 1);
T::ok($result['ok'], 'The real import succeeds');
T::same(6, (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::stays()), 'Six stays were written');
$lines_after_first = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::lines());
T::ok($lines_after_first > 0, 'Money lines were written');

T::group('Idempotent re-import');

$again = Importer::run(dccl_fixture('airbnb-payout.csv'), 'airbnb-payout.csv', false, 1);
T::same(0, $again['counts']['stays_new'], 'The same file a second time adds no stays');
T::same(0, $again['counts']['lines_new'], 'The same file a second time adds no money lines');
T::same($lines_after_first, (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::lines()), 'The line count is unchanged');

T::group('Enrichment without overwriting');

// The reservations file knows the booking date; the payout file did not.
$before = Repo::find_stay('airbnb', 'HMBBBB0003');
$result = Importer::run(dccl_fixture('airbnb-reservations.csv'), 'airbnb-reservations.csv', false, 1);
$after  = Repo::find_stay('airbnb', 'HMBBBB0003');
T::same($before['check_in'], $after['check_in'], 'An existing check-in is not overwritten');
T::same(1, $result['counts']['stays_new'], 'Only the reservation missing from the payout file is new');
T::ok($result['counts']['stays_unchanged'] + $result['counts']['stays_enriched'] === 4, 'The rest were already there');

T::group('Crofty Bear and Hipcamp');

T::same(null, Repo::find_stay('airbnb', 'HMCROFTY01'), 'The Crofty Bear reservation is never stored');
T::same(0, (int) $wpdb->get_var("SELECT COUNT(*) FROM " . Schema::stays() . " WHERE cottage = 'crofty-bear'"), 'No stay carries the excluded cottage');
T::same('crofty-bear', DCCL\Cottages::from_airbnb_listing('Hipcamp at Crofty Bear'), 'A Crofty listing is excluded');
T::same('crofty-bear', DCCL\Cottages::from_airbnb_listing('Hipcamp Riverside Tent'), 'A Hipcamp listing is excluded');
T::same('crofty-bear', DCCL\Cottages::from_bookingcom_hotel_id('14946642'), 'The Crofty hotel id is excluded');
T::same('crofty-bear', DCCL\Cottages::from_vrbo_listing_id('4356282'), 'The Crofty Vrbo listing is excluded');

T::group('Booking.com derived tax');

Importer::run(dccl_fixture('bookingcom-reservations.csv'), 'bookingcom-reservations.csv', false, 1);
Importer::run(dccl_fixture('bookingcom-payout.csv'), 'bookingcom-payout.csv', false, 1);

$stay_id = Repo::stay_id('bookingcom', '5111111111');
$tax     = (float) $wpdb->get_var($wpdb->prepare(
    "SELECT amount FROM " . Schema::lines() . " WHERE stay_id = %d AND type = 'tax_in_payout'",
    $stay_id
));
T::same(72.00, $tax, 'Tax in the payout is the payout less the final amount, measured not assumed');

$stay_id = Repo::stay_id('bookingcom', '5222222222');
$tax     = (float) $wpdb->get_var($wpdb->prepare(
    "SELECT amount FROM " . Schema::lines() . " WHERE stay_id = %d AND type = 'tax_in_payout'",
    $stay_id
));
T::same(54.00, $tax, 'And again on the second reservation');

// 5555555555: payout 896 and a later -100 refund; the tax derives from the
// payout alone, not the refund.
$stay_id = Repo::stay_id('bookingcom', '5555555555');
$tax     = (float) $wpdb->get_var($wpdb->prepare(
    "SELECT amount FROM " . Schema::lines() . " WHERE stay_id = %d AND type = 'tax_in_payout'",
    $stay_id
));
T::same(96.00, $tax, 'A later refund does not change the tax derived from the payout');

$cancelled = Repo::stay_id('bookingcom', '5333333333');
T::same(0, (int) $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM " . Schema::lines() . " WHERE stay_id = %d AND type = 'tax_in_payout'",
    $cancelled
)), 'A cancelled reservation gets no derived tax');

T::group('Batch undo');

// Snapshot the exact state before the batch we are going to undo.
$stays_before = $wpdb->get_results('SELECT * FROM ' . Schema::stays() . ' ORDER BY id', ARRAY_A);
$lines_before = $wpdb->get_results('SELECT * FROM ' . Schema::lines() . ' ORDER BY id', ARRAY_A);

$result = Importer::run(dccl_fixture('vrbo-reservations.csv'), 'vrbo-reservations.csv', false, 1);
$batch  = (int) $result['batch_id'];
T::same(4, $result['counts']['stays_new'], 'The Vrbo import adds four stays');

$undo = Batches::undo($batch);
T::ok($undo['ok'], 'Undo succeeds');
T::same(4, $undo['stays'], 'Undo removed exactly the four stays it added');

$stays_after = $wpdb->get_results('SELECT * FROM ' . Schema::stays() . ' ORDER BY id', ARRAY_A);
$lines_after = $wpdb->get_results('SELECT * FROM ' . Schema::lines() . ' ORDER BY id', ARRAY_A);
T::same($stays_before, $stays_after, 'Undo restores the stays table exactly');
T::same($lines_before, $lines_after, 'Undo restores the lines table exactly');

T::same(false, Batches::undo($batch)['ok'], 'A batch cannot be undone twice');

T::group('Undo restores a field the batch filled in');

// Import the Vrbo payout first (no booked_on), then the reservations file
// (which fills booked_on), then undo it: booked_on must go back to NULL.
Importer::run(dccl_fixture('vrbo-payout.csv'), 'vrbo-payout.csv', false, 1);
$before = Repo::find_stay('vrbo', 'HA-AAA111');
T::same(null, $before['booked_on'], 'The payout file leaves the booking date unknown');

$result = Importer::run(dccl_fixture('vrbo-reservations.csv'), 'vrbo-reservations.csv', false, 1);
$filled = Repo::find_stay('vrbo', 'HA-AAA111');
T::same('2025-02-01 00:00:00', $filled['booked_on'], 'The reservations file fills the booking date in');

Batches::undo((int) $result['batch_id']);
$restored = Repo::find_stay('vrbo', 'HA-AAA111');
T::same(null, $restored['booked_on'], 'Undo puts the filled-in field back to unknown');
T::ok($restored !== null, 'Undo does not delete a stay that already existed');

T::group('Hashes');

$line = [
    'channel'    => 'airbnb',
    'type'       => 'payout',
    'amount'     => 100.0,
    'event_date' => '2025-01-01',
    'stay_code'  => 'HMX',
    'payout_ref' => null,
    'ref_code'   => null,
    'meta'       => [],
];
T::same(Repo::line_hash($line), Repo::line_hash($line), 'The same line hashes the same way twice');
$other = $line;
$other['amount'] = 100.01;
T::ok(Repo::line_hash($line) !== Repo::line_hash($other), 'A different amount hashes differently');
T::ok(Repo::line_hash($line, 0) !== Repo::line_hash($line, 1), 'A repeated identical row is kept, not swallowed');
