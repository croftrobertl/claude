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
use DCCL\Issues;
use DCCL\Originals;
use DCCL\Repo;
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
//   #9011  388.50 due, nothing paid  → 388.50  (a probable move, which is a
//          question for Rob, not a finding — so it counts as the real stay it
//          probably is until he says otherwise)
//   #9023  525.00 due, nothing paid  → 525.00  (same dates as a platform stay
//          in another cottage, but a different surname: a busy weekend)
//   #9024  275.00 due, nothing paid  → 275.00  (looks like a move, but there
//          is no name to compare)
//   #9025  640.00 due, nothing paid  → 640.00  (a probable move; the whole
//          name sits in the first-name field)
$assumed = [];
foreach (Adjustments::all() as $adjustment) {
    if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
        $assumed[(int) $adjustment['mphb_booking_id']] = round((float) $adjustment['amount'], 2);
    }
}
ksort($assumed);

T::same(
    [
        9008 => 350.00, 9011 => 388.50, 9012 => 400.00, 9017 => 450.00,
        9018 => 200.00, 9019 => 300.00, 9022 => 416.25, 9023 => 525.00,
        9024 => 275.00, 9025 => 640.00,
    ],
    $assumed,
    'Each qualifying booking gets the gap, and only the gap'
);
T::same(10, Adjustments::count(Adjustments::ASSUMED_PAID), 'Ten bookings qualify');
T::same(3944.75, Adjustments::total(Adjustments::ASSUMED_PAID), 'Totalling 3,944.75');

T::group('What the assumed-paid rule must never touch');

T::ok(!isset($assumed[9006]), 'Not a hand-typed copy of an OTA stay (same cottage and dates)');
T::ok(!isset($assumed[9013]), 'Not a copy found by the code in its note');
T::ok(!isset($assumed[9014]), 'Not a copy found by a mislabelled code either');
T::ok(!isset($assumed[9009]), 'Not a booking already recorded as paid more than its total');
T::ok(!isset($assumed[9010]), 'Not a cancelled dock block');
T::ok(!isset($assumed[9001]), 'Not an iCal-imported booking');
T::ok(!isset($assumed[9020]), 'Not a booking that checks out after the reconciled window');
T::ok(!isset($assumed[9007]), 'Not a booking that was paid in full');
T::ok(isset($assumed[9022]), 'A booking carrying the code of a CANCELLED stay IS assumed paid: that stay never happened, so this one is real');
T::ok(isset($assumed[9011]), 'An unconfirmed probable move IS assumed paid: Rob\'s rule makes a confirmed booking real until he says otherwise');
T::ok(isset($assumed[9023]), 'And so is a booking that merely shares a weekend with another cottage\'s stay');

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

// April 2025 holds one direct booking, #9007: 500.00 due and 500.00 recorded,
// so nothing is assumed. June holds #9006, a copy. May holds #9008 (600.00
// due, 250.00 recorded → 350.00 assumed) and #9023 (525.00 due, nothing
// recorded → 525.00 assumed).
$original_view = Reports::summary('2025-05-01', '2025-05-31', 'stay', 'original');
$ledger_view   = Reports::summary('2025-05-01', '2025-05-31', 'stay', 'ledger');
$difference    = Reports::summary('2025-05-01', '2025-05-31', 'stay', 'difference');

T::same(250.00, $original_view['totals']['direct_paid'], 'Original: what MotoPress actually recorded');
T::same(1125.00, $ledger_view['totals']['direct_paid'], 'Ledger: the original plus the corrections');
T::same(875.00, $difference['totals']['direct_paid'], 'Difference: the corrections alone');
T::same(
    round($original_view['totals']['direct_paid'] + $difference['totals']['direct_paid'], 2),
    $ledger_view['totals']['direct_paid'],
    'Original plus difference equals ledger'
);
T::same(0.00, $original_view['totals']['direct_assumed'], 'The Original view shows no assumed money at all');
T::same(875.00, $ledger_view['totals']['direct_assumed'], 'The Ledger view shows the corrections as assumed');
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
$parts = $breakdown['copies_by_link'] + $breakdown['copies_by_code'] + $breakdown['copies_by_dates'];

T::same((int) $breakdown['copies_skipped'], $parts, 'The parts of the breakdown add up to the total');
T::ok((int) $breakdown['copies_detected'] >= (int) $breakdown['copies_skipped'], 'Copies detected is never fewer than copies skipped');
T::same(count(Copies::detect(Copies::from_live())), (int) $breakdown['copies_detected'], 'And it matches what detection found');
T::ok((int) $breakdown['probable_moves'] >= 1, 'Probable moves are reported on their own, not as copies');
T::same(count($breakdown['copy_ids']), (int) $breakdown['copies_skipped'], 'The verbose id list matches the count');
T::ok(!in_array(9011, $breakdown['copy_ids'], true), 'An unconfirmed move is not among the copies');

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

T::group('A move needs the same guest, not just the same dates');

$live  = Copies::from_live();
$moves = Copies::probable_moves($live);

// #9011 sits on the Airbnb stay HMMOVED001's dates in another cottage, and
// carries the same surname.
T::ok(isset($moves[9011]), 'The same guest on the same dates is offered as a move');
T::ok(($moves[9011]['named'] ?? false), 'Matched on the surname');
T::same(Repo::stay_id('airbnb', 'HMMOVED001'), (int) ($moves[9011]['stay_id'] ?? 0), 'And to the right stay');

// #9023 sits on the Airbnb stay HMBBBB0003's dates in another cottage, with a
// different surname. This is Rob's 6273: an ordinary busy weekend.
T::ok(!isset($moves[9023]), 'A different party on the same weekend is NOT offered as a move');
T::ok(isset(Copies::move_candidates($live)[9023]), 'Even though the dates and cottages line up exactly');
T::ok(!isset(Copies::detect($live)[9023]), 'And it is certainly not treated as a copy');

T::group('A cancelled booking is never a move, a copy or a question');

// #7078 is a cancelled dock block sitting exactly where a moved guest would
// sit, with a matching surname. It is not a stay, so it is none of those.
T::ok(!isset($moves[7078]), 'It is not offered as a probable move');
T::ok(!isset(Copies::detect($live)[7078]), 'It is not treated as a copy');
T::ok(!isset(Copies::move_candidates($live)[7078]), 'It is not even a candidate');

$cancelled_in_source = false;
foreach ($live as $candidate) {
    $cancelled_in_source = $cancelled_in_source || (int) $candidate['id'] === 7078;
}
T::ok(!$cancelled_in_source, 'A cancelled booking does not reach copy detection at all');

T::ok(
    !in_array('move_copy:7078:' . (int) (Copies::move_candidates(Copies::from_live())[7078]['id'] ?? 0), array_column(Issues::all(), 'key'), true),
    'And it puts no question in front of Rob'
);

T::group('Where there is no name, nothing is guessed');

T::ok(isset($moves[9024]), '#9024 is raised');
T::ok(!($moves[9024]['named'] ?? true), 'But marked as having no name to compare');

$unnamed_item = null;
foreach (Issues::all() as $item) {
    if ($item['key'] === 'move_copy:9024:' . (int) $moves[9024]['stay_id']) {
        $unnamed_item = $item;
    }
}
T::ok($unnamed_item !== null, 'It reaches the cleanup list');
T::same('Possible Move, No Name To Compare', $unnamed_item === null ? '' : $unnamed_item['title'], 'Under its own title');

T::group('An empty last name falls back to the rest of the record');

// #9025 has no last name; the whole name is in the first-name field.
T::ok(isset($moves[9025]), 'It is still matched');
T::ok(($moves[9025]['named'] ?? false), 'On a name, not on a guess');

T::group('A probable move counts as a real stay until it is confirmed');

$auto_linked = false;
foreach (Repo::links_for_stay((int) $moves[9011]['stay_id']) as $link) {
    $auto_linked = $auto_linked || (int) $link['mphb_booking_id'] === 9011;
}
T::ok(!$auto_linked, 'It is never linked without a person');
T::ok(!isset(Copies::detect($live)[9011]), 'And is not counted as a copy');

$keys = array_column(Issues::all(), 'key');
T::ok(in_array('move_copy:9011:' . (int) $moves[9011]['stay_id'], $keys, true), 'It is raised for Rob to decide');

T::group('Rejecting a move stops it being asked about');

$move_stay = (int) $moves[9011]['stay_id'];
DCCL\Decisions::reject_move(9011, $move_stay, 'Two different guests.', 1);
T::ok(!isset(Copies::probable_moves(Copies::from_live())[9011]), 'Once rejected, it is no longer offered');
T::ok(!in_array('move_copy:9011:' . $move_stay, array_column(Issues::all(), 'key'), true), 'And it leaves the cleanup list');

DCCL\Decisions::clear_move_rejection(9011, $move_stay);
T::ok(isset(Copies::probable_moves(Copies::from_live())[9011]), 'Clearing the decision brings the question back');

T::group('A move that is already explained in its own cottage is not a move');

// Booking #9006 is a same-cottage copy of Booking.com 5555555555 (cottage 35,
// 10-14 June). A booking on those dates in another cottage is therefore not
// where that guest went.
$decoy = Copies::move_candidates(array_merge(Copies::from_live(), [[
    'id'         => 9999,
    'cottage'    => '31',
    'check_in'   => '2025-06-10',
    'check_out'  => '2025-06-14',
    'codes'      => [],
    'guest_keys' => [],
]]));
T::ok(!isset($decoy[9999]), 'With the stay already claimed in its own cottage, nothing else is read as the move');

T::group('The snapshot will not assume-pay before the exports are in');

T::ok(DCCL\Snapshot::reservations_imported(), 'With the reservations imported, the gate is open');
