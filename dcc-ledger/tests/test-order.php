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
// import or decision then reveals. #9006 is a hand-typed copy of a platform
// stay; here it carries an assumed payment that should not stand.
$booking_id = 9006;
Adjustments::add([
    'type'            => Adjustments::ASSUMED_PAID,
    'mphb_booking_id' => $booking_id,
    'cottage'         => '35',
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
    'cottage'         => '35',
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

T::group('Confirming a move makes it a copy, and reverses its assumption');

// #9011 is a probable move that has been assumed paid, because an unconfirmed
// move counts as a real stay. Confirming it should settle both.
$move_stay = (int) Repo::stay_id('airbnb', 'HMMOVED001');
T::ok(isset(Copies::probable_moves(Copies::from_live())[9011]), 'It starts as a question');
T::ok(Adjustments::assumed_for(9011) !== null, 'And carries an assumed payment as a real stay');

Repo::link($move_stay, 9011, 'copy', 1);
$confirmed = Copies::detect(Copies::from_live())[9011] ?? null;
T::ok($confirmed !== null, 'Once linked it is a copy');
T::same(Copies::REASON_LINK, $confirmed === null ? '' : $confirmed['reason'], 'Reported as settled by a link');
T::ok(!isset(Copies::probable_moves(Copies::from_live())[9011]), 'And stops being asked about');

T::ok(in_array('assumed_on_copy:9011', array_column(Issues::all(), 'key'), true), 'Its assumed payment is now raised as sitting on a copy');

T::group('The reversal holds even if the booking stops being seen as a copy');

// #9011 was confirmed as a move in the group above, so its assumed payment is
// now sitting on a copy. Reverse it, then take the confirmation back: the
// booking becomes a real stay again, and the reversed assumption must not come
// back to life with it.
$assumed_on_move = Adjustments::assumed_for(9011);
T::ok($assumed_on_move !== null, 'The assumed payment is still standing');

Adjustments::add([
    'type'            => Adjustments::ASSUMED_REVERSAL,
    'mphb_booking_id' => 9011,
    'cottage'         => (string) $assumed_on_move['cottage'],
    'amount'          => -1 * (float) $assumed_on_move['amount'],
    'event_date'      => (string) $assumed_on_move['event_date'],
    'label'           => Adjustments::label_for(Adjustments::ASSUMED_REVERSAL),
    'note'            => 'Cancelled, not removed.',
], null, 1);

foreach (Repo::links_for_stay($move_stay) as $link) {
    if ((int) $link['mphb_booking_id'] === 9011) {
        Repo::unlink((int) $link['id']);
    }
}
Decisions::reject_move(9011, $move_stay, 'Two different guests after all.', 1);

T::ok(!isset(Copies::detect(Copies::from_live())[9011]), 'It is no longer a copy');
T::ok(!isset(Copies::probable_moves(Copies::from_live())[9011]), 'And no longer a question either');

$net = 0.0;
foreach (Adjustments::for_booking(9011) as $adjustment) {
    if (in_array((string) $adjustment['type'], Adjustments::ASSUMED_TYPES, true)) {
        $net = round($net + (float) $adjustment['amount'], 2);
    }
}
T::same(0.0, $net, 'Its assumed money nets to nothing, so none reappears');
T::same(2, count(Adjustments::for_booking(9011)), 'Both halves are still on the record');
