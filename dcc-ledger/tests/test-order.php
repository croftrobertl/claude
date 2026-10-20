<?php
/**
 * The order trap, and what happens when a copy turns up after the fact.
 *
 * A snapshot taken before the platform exports are imported has no stays to
 * compare against, so it cannot tell a hand-typed copy from a real direct
 * booking. Since an assumed payment is never silently removed, writing them at
 * that point would permanently assume-pay every copy.
 */

declare(strict_types=1);

use DCCL\Adjustments;
use DCCL\Copies;
use DCCL\Decisions;
use DCCL\Issues;
use DCCL\Linker;
use DCCL\Originals;
use DCCL\Repo;
use DCCL\Schema;
use DCCL\Snapshot;

global $wpdb;

T::group('A snapshot before the imports copies, but assumes nothing');

dccl_seed_mphb();

T::ok(!Snapshot::reservations_imported(), 'No reservations export has been imported');

$early = Snapshot::run(true, 1);
T::ok($early['ok'], 'The dry run still runs');
T::same(1, (int) $early['counts']['assumed_withheld'], 'It reports that the assumed payments were withheld');
T::same(0, (int) $early['counts']['assumed_bookings'], 'And names none');
T::ok($early['notes'] !== [], 'It says why');
T::ok(str_contains((string) ($early['notes'][0] ?? ''), 'Import the reservations exports first'), 'And says what to do about it');

$run = Snapshot::run(false, 1);
T::ok($run['ok'], 'The real snapshot runs too');
T::ok(Originals::count(Originals::KIND_BOOKING) > 0, 'The copy of MotoPress is made');
T::same(0, Adjustments::count(Adjustments::ASSUMED_PAID), 'But not one assumed payment is written');

// This is what the gate prevents: #9006 is a hand-typed copy, and with no
// stays to recognise it by it would have been assumed paid for good.
$copies_now = Copies::detect(Copies::from_live());
T::same([], $copies_now, 'With no stays imported, no copy can be recognised at all');

T::group('Once the exports are in, the assumed payments follow');

dccl_import_all();
Linker::run(1);

T::ok(Snapshot::reservations_imported(), 'The gate is open');

$after = Snapshot::run(false, 1);
T::same(0, (int) $after['counts']['assumed_withheld'], 'Nothing is withheld now');
T::ok($after['counts']['assumed_bookings'] > 0, 'The assumed payments are written');

$assumed_bookings = [];
foreach (Adjustments::all() as $adjustment) {
    if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
        $assumed_bookings[] = (int) $adjustment['mphb_booking_id'];
    }
}
T::ok(!in_array(9006, $assumed_bookings, true), 'And the hand-typed copy is not among them');
T::ok(!in_array(9013, $assumed_bookings, true), 'Nor the copy identified by its note code');

T::group('An assumed payment that turns out to sit on a copy');

// A booking assumed paid while nothing marked it as a copy, which a later
// decision then reveals. #9023 is the probable move; confirm it as a copy
// after it has already been assumed paid.
$booking_id = 9023;
Adjustments::add([
    'type'            => Adjustments::ASSUMED_PAID,
    'mphb_booking_id' => $booking_id,
    'cottage'         => '33',
    'amount'          => 525.00,
    'event_date'      => '2025-05-01',
    'label'           => Adjustments::label_for(Adjustments::ASSUMED_PAID),
    'note'            => 'Assumed, actual date unknown.',
], null, 1);

$standing = Adjustments::assumed_for($booking_id);
T::ok($standing !== null, 'The assumed payment stands against the booking');

$keys = array_column(Issues::all(), 'key');
T::ok(in_array('assumed_on_copy:' . $booking_id, $keys, true), 'The cleanup list raises it as an assumed payment on a copy');

// Reverse it the way the button does.
Adjustments::add([
    'type'            => Adjustments::ASSUMED_REVERSAL,
    'mphb_booking_id' => $booking_id,
    'cottage'         => '33',
    'amount'          => -525.00,
    'event_date'      => '2025-05-01',
    'label'           => Adjustments::label_for(Adjustments::ASSUMED_REVERSAL),
    'note'            => 'Cancelled, not removed.',
], null, 1);

T::same(null, Adjustments::assumed_for($booking_id), 'After reversal, nothing stands against it');
T::ok(!in_array('assumed_on_copy:' . $booking_id, array_column(Issues::all(), 'key'), true), 'And the cleanup item is gone');

$rows = $wpdb->get_results(
    $wpdb->prepare('SELECT type, amount FROM ' . Schema::adjustments() . ' WHERE mphb_booking_id = %d ORDER BY id', $booking_id),
    ARRAY_A
);
T::same(2, count($rows), 'Both halves are on the record: nothing was deleted');
T::same(Adjustments::ASSUMED_PAID, (string) $rows[0]['type'], 'The assumption is still there');
T::same(Adjustments::ASSUMED_REVERSAL, (string) $rows[1]['type'], 'With its reversal beside it');
T::same(0.0, round((float) $rows[0]['amount'] + (float) $rows[1]['amount'], 2), 'And they cancel out exactly');

T::group('A confirmed link outranks an earlier rejection');

// Somebody rejects the move, then somebody else confirms it by linking. The
// later decision is the one that stands.
$stay_for_move = (int) Repo::stay_id('airbnb', 'HMBBBB0003');
Decisions::reject_move(9023, $stay_for_move, 'Not a move.', 1);
T::ok(!isset(Copies::detect(Copies::from_live())[9023]), 'The rejection takes effect');

Repo::link($stay_for_move, 9023, 'copy', 1);
$after_link = Copies::detect(Copies::from_live())[9023] ?? null;
T::ok($after_link !== null, 'Linking it as a copy brings it back');
T::ok($after_link !== null && $after_link['confirmed'], 'And it counts as confirmed, not as a guess');

Repo::unlink((int) Repo::links_for_stay($stay_for_move)[0]['id']);
Decisions::clear_move_rejection(9023, $stay_for_move);

T::group('The reversal holds even if the booking stops being seen as a copy');

// Reject the move: the booking becomes a separate stay again. The reversed
// assumption must not come back to life with it.
$stay_id = Repo::stay_id('airbnb', 'HMBBBB0003');
Decisions::reject_move($booking_id, (int) $stay_id, 'Two different guests.', 1);

T::ok(!isset(Copies::detect(Copies::from_live())[$booking_id]), 'It is no longer a copy');

$may = DCCL\Reports::summary('2025-05-01', '2025-05-31', 'stay', 'ledger');
$assumed_in_may = 0.0;
foreach (Adjustments::for_booking($booking_id) as $adjustment) {
    if (in_array((string) $adjustment['type'], Adjustments::ASSUMED_TYPES, true)) {
        $assumed_in_may = round($assumed_in_may + (float) $adjustment['amount'], 2);
    }
}
T::same(0.0, $assumed_in_may, 'Its assumed money nets to nothing, so none reappears');
