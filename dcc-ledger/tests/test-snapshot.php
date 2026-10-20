<?php
/**
 * The copy, and the corrections that sit on top of it.
 *
 * Rob's data is duplicated into the ledger and modified from there, so that if
 * anything goes wrong his original is still intact. These tests hold that line:
 * an Original is never edited, a refresh records a change as a new version
 * beside the old one, and an adjustment is never touched by either.
 */

declare(strict_types=1);

use DCCL\Adjustments;
use DCCL\Copies;
use DCCL\Batches;
use DCCL\Health;
use DCCL\Mphb_Reader;
use DCCL\Originals;
use DCCL\Reports;
use DCCL\Schema;
use DCCL\Snapshot;

global $wpdb;

T::group('MotoPress looks the way the plugin expects');

dccl_seed_mphb();
dccl_import_all();
DCCL\Linker::run(1);

// Checked before anything else: every figure about direct bookings rests on
// these spellings, and a wrong one returns no rows rather than an error.
$health = Health::check();
$named  = [];
foreach ($health['missing'] as $item) {
    $named[] = $item['what'];
}
T::ok($health['ok'], 'Every required MotoPress key and status is present' . ($named === [] ? '' : ' (missing: ' . implode(', ', $named) . ')'));

if (!$health['ok']) {
    // Without them the snapshot refuses to run, which is the point — but the
    // rest of this file has nothing to measure, so it stops here rather than
    // failing in a heap.
    $banner = Health::banner();
    T::ok($banner !== '', 'A banner is shown in place of figures');
    foreach ($named as $name) {
        T::ok(str_contains($banner, $name), 'The banner names ' . $name);
    }
    $refused = Snapshot::run(true, 1);
    T::ok(!$refused['ok'], 'A snapshot refuses to run rather than copy zeroes');
    return;
}

T::group('The snapshot copies MotoPress faithfully');

$batches_before = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::batches());

$dry = Snapshot::run(true, 1);
T::ok($dry['ok'], 'A dry run succeeds');
T::same(0, Originals::count(Originals::KIND_BOOKING), 'A dry run copies nothing');
T::same(0, (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::adjustments()), 'A dry run writes no corrections');
T::same($batches_before, (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::batches()), 'A dry run writes no batch of its own');

$run = Snapshot::run(false, 1);
T::ok($run['ok'], 'The real snapshot succeeds');
T::same($dry['counts']['bookings_new'], $run['counts']['bookings_new'], 'The dry run predicted the bookings exactly');
T::same($dry['counts']['assumed_bookings'], $run['counts']['assumed_bookings'], 'And the assumed payments exactly');
T::same($dry['counts']['assumed_total'], $run['counts']['assumed_total'], 'And their total exactly');

$copied = Originals::bookings_with_payments();
T::ok(isset($copied[9007]), 'A direct booking is copied');
T::ok(!isset($copied[9001]), 'An iCal-imported booking is not — it is an OTA stay, not a direct one');
T::same(500.00, (float) $copied[9007]['total'], 'The booking total is copied');
T::same(500.00, (float) $copied[9007]['paid'], 'Its completed payment is copied');
T::same('23', (string) $copied[9007]['cottage'], 'And its cottage');
T::same('2025-04-01', (string) $copied[9007]['check_in'], 'And its dates');

T::group('A refunded payment is visible, and is not money');

T::same(0.00, (float) $copied[9017]['paid'], 'A refunded payment is not counted as paid');
T::same(450.00, (float) $copied[9017]['refunded'], 'It is reported on its own');
T::same(1, count($copied[9017]['payments']), 'The payment itself is still copied');
T::same(Mphb_Reader::PAYMENT_REFUNDED, (string) $copied[9017]['payments'][0]['payment_status'], 'With its real status');

T::same(300.00, (float) $copied[9018]['paid'], 'A part-refunded booking counts only the completed part');
T::same(200.00, (float) $copied[9018]['refunded'], 'And reports the refunded part apart');
T::same(0.00, (float) $copied[9019]['paid'], 'A failed payment is not money either');

T::group('The snapshot is idempotent');

$again = Snapshot::run(false, 1);
T::same(0, $again['counts']['bookings_new'], 'A second snapshot copies no new bookings');
T::same(0, $again['counts']['bookings_changed'], 'And records no changes');
T::same(0, $again['counts']['payments_new'], 'And no new payments');
T::same(0, $again['counts']['assumed_bookings'], 'And adds no second assumed payment');
T::same($run['counts']['bookings_read'], $again['counts']['bookings_read'], 'It still reads them all');

T::group("Rob's assumed-paid rule");

// Worked out by hand from the fixtures. A booking qualifies when it is
// confirmed, is not a copy of an OTA stay, checked out inside the window, and
// has a gap between its total and its completed payments.
//   #9008  600.00 due, 250.00 paid   → 350.00
//   #9012  400.00 due, nothing paid  → 400.00
//   #9017  450.00 due, all refunded  → 450.00
//   #9018  500.00 due, 300.00 paid   → 200.00
//   #9019  300.00 due, payment failed→ 300.00
//   #9022  416.25 due, nothing paid  → 416.25  (carries the code of a
//          CANCELLED platform stay, so it is a real stay, not a copy)
$assumed = [];
foreach (Adjustments::all() as $adjustment) {
    if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
        $assumed[(int) $adjustment['mphb_booking_id']] = round((float) $adjustment['amount'], 2);
    }
}
ksort($assumed);

T::same(
    [9008 => 350.00, 9012 => 400.00, 9017 => 450.00, 9018 => 200.00, 9019 => 300.00, 9022 => 416.25],
    $assumed,
    'Each qualifying booking gets the gap, and only the gap'
);
T::same(6, Adjustments::count(Adjustments::ASSUMED_PAID), 'Six bookings qualify');
T::same(2116.25, Adjustments::total(Adjustments::ASSUMED_PAID), 'Totalling 2,116.25');

T::group('What the assumed-paid rule must never touch');

T::ok(!isset($assumed[9006]), 'Not a hand-typed copy of an OTA stay (same cottage and dates)');
T::ok(!isset($assumed[9013]), 'Not a copy found by the code in its note');
T::ok(!isset($assumed[9014]), 'Not a copy found by a mislabelled code either');
T::ok(!isset($assumed[9009]), 'Not a booking already recorded as paid more than its total');
T::ok(!isset($assumed[9010]), 'Not a cancelled dock block');
T::ok(!isset($assumed[9001]), 'Not an iCal-imported booking');
T::ok(!isset($assumed[9020]), 'Not a booking that checks out after the reconciled window');
T::ok(!isset($assumed[9007]), 'Not a booking that was paid in full');
T::ok(!isset($assumed[9011]), 'And not a probable move copy — its money came through the platform');
T::ok(!isset($assumed[9023]), 'Nor the move the ledger spotted on its own');
T::ok(isset($assumed[9022]), 'But a booking carrying the code of a CANCELLED stay IS assumed paid: that stay never happened, so this one is real');

$run2 = Snapshot::run(true, 1);
T::ok($run2['counts']['copies_skipped'] >= 3, 'The copies are reported as skipped');
T::ok($run2['counts']['overpaid_skipped'] >= 1, 'So is the overpaid booking');

T::group('An Original is never edited');

$original = Originals::current(Originals::KIND_BOOKING, 9007);
$before   = $original['total'];

T::ok(!Originals::update((int) $original['id'], ['total' => '1.00']), 'An attempt to edit a copied total is refused');
T::ok(!Originals::update((int) $original['id'], ['check_in' => '2030-01-01']), 'An attempt to edit copied dates is refused');
T::ok(!Originals::update((int) $original['id'], ['total' => '1.00', 'is_current' => 1]), 'Smuggling a content field in beside a version field is refused too');

$after = Originals::current(Originals::KIND_BOOKING, 9007);
T::same($before, $after['total'], 'The copied total is exactly as it was');
T::same((int) $original['id'], (int) $after['id'], 'And it is still the same row');

T::group('A change in MotoPress becomes a new version, beside the old one');

// Rob raises the price of booking 9007 in MotoPress.
$wpdb->update(
    $wpdb->postmeta,
    ['meta_value' => '575.00'],
    ['post_id' => 9007, 'meta_key' => Mphb_Reader::META_TOTAL]
);

$refresh = Snapshot::run(false, 1);
T::same(1, $refresh['counts']['bookings_changed'], 'The refresh notices exactly one changed booking');

$current = Originals::current(Originals::KIND_BOOKING, 9007);
T::same(575.00, (float) $current['total'], 'The new version holds the new figure');
T::same(2, (int) $current['version'], 'It is version 2');

$old = $wpdb->get_row(
    $wpdb->prepare(
        'SELECT * FROM ' . Schema::originals() . ' WHERE kind = %s AND mphb_id = %d AND version = 1',
        Originals::KIND_BOOKING,
        9007
    ),
    ARRAY_A
);
T::same(500.00, (float) $old['total'], 'Version 1 still holds what MotoPress held before');
T::same(0, (int) $old['is_current'], 'It is no longer the current one');
T::ok((string) $old['superseded_at'] !== '', 'And it is stamped with when it was superseded');

$keys = array_column(DCCL\Issues::all(), 'key');
$changed = false;
foreach ($keys as $key) {
    $changed = $changed || str_starts_with($key, 'mphb_changed:booking:9007');
}
T::ok($changed, 'The change is raised on the cleanup list');

T::group('A refresh never touches a correction');

$adjustments_before = $wpdb->get_results('SELECT * FROM ' . Schema::adjustments() . ' ORDER BY id', ARRAY_A);
Snapshot::run(false, 1);
$adjustments_after = $wpdb->get_results('SELECT * FROM ' . Schema::adjustments() . ' ORDER BY id', ARRAY_A);
T::same($adjustments_before, $adjustments_after, 'Every correction is exactly as it was');

T::group('Each assumed payment is dated and labelled');

$row = $wpdb->get_row(
    $wpdb->prepare('SELECT * FROM ' . Schema::adjustments() . ' WHERE mphb_booking_id = %d', 9008),
    ARRAY_A
);
T::same('2025-05-01', (string) $row['event_date'], 'Dated at the booking\'s check-in');
T::same('Assumed Paid In Full', (string) $row['label'], 'And labelled as assumed');
T::ok(str_contains((string) $row['note'], 'actual date unknown'), 'And says the real date is not known');

T::group('The three views add up');

// May 2025 holds direct booking #9008: 600.00 due, 250.00 recorded, so the
// ledger assumes the remaining 350.00.
$original_view = Reports::summary('2025-05-01', '2025-05-31', 'stay', 'original');
$ledger_view   = Reports::summary('2025-05-01', '2025-05-31', 'stay', 'ledger');
$difference    = Reports::summary('2025-05-01', '2025-05-31', 'stay', 'difference');

T::same(250.00, $original_view['totals']['direct_paid'], 'Original: what MotoPress actually recorded');
T::same(600.00, $ledger_view['totals']['direct_paid'], 'Ledger: the original plus the correction');
T::same(350.00, $difference['totals']['direct_paid'], 'Difference: the correction alone');
T::same(
    round($original_view['totals']['direct_paid'] + $difference['totals']['direct_paid'], 2),
    $ledger_view['totals']['direct_paid'],
    'Original plus difference equals ledger'
);
T::same(0.00, $original_view['totals']['direct_assumed'], 'The Original view shows no assumed money at all');
T::same(350.00, $ledger_view['totals']['direct_assumed'], 'The Ledger view shows the correction as assumed');
T::same($original_view['totals']['nights'], $ledger_view['totals']['nights'], 'Nights do not move between views');

T::group('Undoing a snapshot');

$before_rows = $wpdb->get_results('SELECT * FROM ' . Schema::originals() . ' ORDER BY id', ARRAY_A);
$before_adj  = $wpdb->get_results('SELECT * FROM ' . Schema::adjustments() . ' ORDER BY id', ARRAY_A);

// A fresh booking, copied by a new batch, then undone.
$wpdb->insert($wpdb->posts, [
    'ID' => 9030, 'post_parent' => 0, 'post_type' => Mphb_Reader::POST_TYPE_BOOKING,
    'post_status' => 'confirmed', 'post_title' => 'Booking #9030', 'post_date' => '2025-08-01 10:00:00',
]);
$wpdb->insert($wpdb->posts, [
    'ID' => 90300, 'post_parent' => 9030, 'post_type' => Mphb_Reader::POST_TYPE_RESERVED_ROOM,
    'post_status' => 'publish', 'post_title' => 'Reserved room', 'post_date' => '2025-08-01 10:00:00',
]);
$wpdb->insert($wpdb->postmeta, ['post_id' => 90300, 'meta_key' => Mphb_Reader::META_ROOM_ID, 'meta_value' => '1072']);
$wpdb->insert($wpdb->postmeta, ['post_id' => 9030, 'meta_key' => Mphb_Reader::META_CHECK_IN, 'meta_value' => '2025-08-20']);
$wpdb->insert($wpdb->postmeta, ['post_id' => 9030, 'meta_key' => Mphb_Reader::META_CHECK_OUT, 'meta_value' => '2025-08-23']);
$wpdb->insert($wpdb->postmeta, ['post_id' => 9030, 'meta_key' => Mphb_Reader::META_TOTAL, 'meta_value' => '600.00']);

$new_batch = Snapshot::run(false, 1);
T::same(1, $new_batch['counts']['bookings_new'], 'The new booking is copied');
T::same(1, $new_batch['counts']['assumed_bookings'], 'And earns an assumed payment');

$undo = Batches::undo((int) $new_batch['batch_id']);
T::ok($undo['ok'], 'The snapshot batch can be undone');
T::same($before_rows, $wpdb->get_results('SELECT * FROM ' . Schema::originals() . ' ORDER BY id', ARRAY_A), 'The copied rows are exactly as they were');
T::same($before_adj, $wpdb->get_results('SELECT * FROM ' . Schema::adjustments() . ' ORDER BY id', ARRAY_A), 'And so are the corrections');

T::group('Undo puts a superseded version back');

$wpdb->update($wpdb->postmeta, ['meta_value' => '999.00'], ['post_id' => 9008, 'meta_key' => Mphb_Reader::META_TOTAL]);
$current_before = Originals::current(Originals::KIND_BOOKING, 9008);

$changing = Snapshot::run(false, 1);
T::same(999.00, (float) Originals::current(Originals::KIND_BOOKING, 9008)['total'], 'The change is recorded as the current version');

Batches::undo((int) $changing['batch_id']);
$current_after = Originals::current(Originals::KIND_BOOKING, 9008);
T::same((int) $current_before['id'], (int) $current_after['id'], 'Undo makes the earlier version current again');
T::same((float) $current_before['total'], (float) $current_after['total'], 'With the figure it always held');
T::same(null, $current_after['superseded_at'], 'And no longer marked superseded');

T::group('The copy count is broken down by how each was found');

$breakdown = Snapshot::run(true, 1)['counts'];
$total = $breakdown['copies_by_link'] + $breakdown['copies_by_code']
       + $breakdown['copies_by_dates'] + $breakdown['copies_by_move'];

T::same(count(Copies::detect(Copies::from_live())), $total, 'Every copy is accounted for by one signal');
T::ok($breakdown['copies_by_move'] >= 1, 'At least one was found as a probable move');
T::ok($breakdown['copies_by_code'] >= 1, 'At least one by a code in a note');

T::group('A missing MotoPress key is never a figure of zero');

T::same('', Health::banner(), 'With everything present, no banner is shown');

// The unprefixed status spelling: MotoPress has none, so paid would read 0.
$wpdb->query("UPDATE {$wpdb->posts} SET post_status = 'completed' WHERE post_type = '" . Mphb_Reader::POST_TYPE_PAYMENT . "'");
$broken = Health::check();
T::ok(!$broken['ok'], 'With no mphb-p-completed payment anywhere, the check fails');
T::ok(str_contains(Health::banner(), 'mphb-p-completed'), 'And the banner names what is missing');

$refused = Snapshot::run(true, 1);
T::ok(!$refused['ok'], 'A snapshot refuses to run rather than copy zeroes');
T::ok(str_contains($refused['message'], 'mphb-p-completed'), 'And says why');

T::group('A cancelled platform stay is never the original of a copy');

// Rob's 5584: a direct booking whose note carries the code of a Vrbo stay that
// was cancelled. The money never came through that channel, so the booking is
// a real, separate stay.
$detected = DCCL\Copies::detect(DCCL\Copies::from_live());
T::ok(!isset($detected[9022]), 'A booking carrying a cancelled stay\'s code is not a copy');

$cancelled_stay = DCCL\Repo::find_stay('vrbo', 'HA-BBB222');
T::same('cancelled', (string) $cancelled_stay['status'], 'The stay it names really is cancelled');

$linked_to_cancelled = false;
foreach (DCCL\Repo::links_for_stay((int) $cancelled_stay['id']) as $link) {
    $linked_to_cancelled = $linked_to_cancelled || (int) $link['mphb_booking_id'] === 9022;
}
T::ok(!$linked_to_cancelled, 'And it is never linked to it as a copy');

// The same holds for an expired request, which also never happened.
$expired = DCCL\Repo::find_stay('vrbo', 'HA-CCC333');
T::same('expired', (string) $expired['status'], 'The expired request is stored as expired');
T::same([], DCCL\Repo::links_for_stay((int) $expired['id']), 'And nothing is a copy of it');

T::group('A moved-cottage copy is spotted, and is a guess until confirmed');

// #9023 sits on the Airbnb stay HMBBBB0003's dates (1-4 May) in another
// cottage, with nothing booked in cottage 35 on those dates.
$move = $detected[9023] ?? null;
T::ok($move !== null, 'The move is detected');
T::same(DCCL\Copies::REASON_MOVE, $move === null ? '' : $move['reason'], 'And is recognised as a move');
T::ok($move !== null && !$move['confirmed'], 'It is marked as a guess, not a certainty');

$stay_id = $move === null ? 0 : (int) $move['stay_id'];
T::same(DCCL\Repo::stay_id('airbnb', 'HMBBBB0003'), $stay_id, 'Matched to the right platform stay');

$auto_linked = false;
foreach (DCCL\Repo::links_for_stay($stay_id) as $link) {
    $auto_linked = $auto_linked || (int) $link['mphb_booking_id'] === 9023;
}
T::ok(!$auto_linked, 'A probable move is never linked without a person');

$keys = array_column(DCCL\Issues::all(), 'key');
T::ok(in_array('move_copy:9023:' . $stay_id, $keys, true), 'It is raised on the cleanup list for Rob to decide');

T::group('Rejecting a move makes it a separate stay again');

DCCL\Decisions::reject_move(9023, $stay_id, 'Two different guests, same week.', 1);
$after = DCCL\Copies::detect(DCCL\Copies::from_live());
T::ok(!isset($after[9023]), 'Once rejected, it is no longer a copy');

$keys_after = array_column(DCCL\Issues::all(), 'key');
T::ok(!in_array('move_copy:9023:' . $stay_id, $keys_after, true), 'And it stops being asked about');

DCCL\Decisions::clear_move_rejection(9023, $stay_id);
T::ok(isset(DCCL\Copies::detect(DCCL\Copies::from_live())[9023]), 'Clearing the decision brings the guess back');

T::group('A move that is already explained in its own cottage is not a move');

// Booking #9006 is a same-cottage copy of Booking.com 5555555555 (cottage 35,
// 10-14 June). A booking on those dates in another cottage is therefore not
// where that guest went.
$decoy = DCCL\Copies::detect(array_merge(DCCL\Copies::from_live(), [[
    'id'        => 9999,
    'cottage'   => '31',
    'check_in'  => '2025-06-10',
    'check_out' => '2025-06-14',
    'codes'     => [],
]]));
T::ok(!isset($decoy[9999]), 'With the stay already claimed in its own cottage, nothing else is read as the move');

T::group('The snapshot will not assume-pay before the exports are in');

T::ok(DCCL\Snapshot::reservations_imported(), 'With the reservations imported, the gate is open');
