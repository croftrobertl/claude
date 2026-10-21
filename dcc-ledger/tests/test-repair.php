<?php
/**
 * The confirmed moves that need naming, and the links 0.1.3 left behind.
 */

declare(strict_types=1);

use DCCL\Adjustments;
use DCCL\Batches;
use DCCL\Copies;
use DCCL\Health;
use DCCL\Issues;
use DCCL\Linker;
use DCCL\Repair;
use DCCL\Repo;
use DCCL\Schema;
use DCCL\Snapshot;

global $wpdb;

T::group('A confirmed move is found by its channel and cottage, not its dates');

dccl_seed_mphb();
dccl_import_all();
Linker::run(1);

// #7278 was moved out of cottage 32 on 24-26 October. TWO platform stays sit
// there on those nights — an Airbnb one and a Vrbo one, the double booking
// that caused the move. Dates alone cannot choose between them, which is why
// 0.1.4 linked nothing at all.
$airbnb_stay = (int) Repo::stay_id('airbnb', 'HM7278AAA1');
$vrbo_stay   = (int) Repo::stay_id('vrbo', 'HA-DOUBLE1');

T::ok($airbnb_stay > 0, 'The Airbnb stay exists');
T::ok($vrbo_stay > 0, 'And so does the Vrbo stay on the same nights in the same cottage');

$candidates = 0;
foreach (Copies::live_stays() as $stay) {
    if ((string) $stay['cottage'] === '32'
        && (string) $stay['check_in'] === '2025-10-24'
        && (string) $stay['check_out'] === '2025-10-26') {
        $candidates++;
    }
}
T::same(2, $candidates, 'Two live stays share that cottage and those nights');

$linked_to = null;
foreach (Repo::all_links() as $link) {
    if ((int) $link['mphb_booking_id'] === 7278) {
        $linked_to = (int) $link['stay_id'];
    }
}
T::same($airbnb_stay, $linked_to, '#7278 is linked to the Airbnb stay, as Rob ruled');
T::ok($linked_to !== $vrbo_stay, 'And never to the Vrbo one');

$vrbo_links = [];
foreach (Repo::links_for_stay($vrbo_stay) as $link) {
    $vrbo_links[] = (int) $link['mphb_booking_id'];
}
T::same([9040], $vrbo_links, 'The Vrbo stay links only to its own imported booking');

T::group('A move carrying a full payment is still counted once');

// #7278 is paid in full, so it earns no assumed payment and a missing link
// would not show up in the assumed total at all. It would show up as its
// money counted twice.
Snapshot::run(false, 1);

$assumed_ids = [];
foreach (Adjustments::all() as $adjustment) {
    if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
        $assumed_ids[] = (int) $adjustment['mphb_booking_id'];
    }
}
T::ok(!in_array(7278, $assumed_ids, true), 'It has no assumed payment, because it is paid in full');

$copies = Copies::ids(Copies::detect(Copies::from_live()));
T::ok(isset($copies[7278]), 'It is counted as a copy, so its nights and money count once');

// October also holds booking #9018, which really did record $300.00. What
// matters is that 7278's $388.50 is NOT added on top of it.
$october = DCCL\Reports::summary('2025-10-01', '2025-10-31', 'stay', 'ledger');
T::same(300.00, $october['totals']['direct_recorded'], 'Only the genuinely direct payment is counted');
T::same(1, $october['direct']['copies_excluded'], '7278 is excluded as a copy');
T::same(388.50, $october['direct']['copy_payments'], 'And its payment is shown on the copy, not counted');
// October's direct nights are #9018's three and #9025's five. 7278's two are
// not among them: they belong to the Airbnb stay.
T::same(8, $october['direct']['nights'], 'Its two nights are not counted as direct nights');
// October's platform nights are HA-EEE555's five plus two each for the Airbnb
// and Vrbo stays that were double-booked into cottage 32 — both of which
// really were booked, which is what caused the move in the first place.
$airbnb_nights = 0;
foreach (DCCL\Reports::stay_rows('2025-10-01', '2025-10-31') as $row) {
    if ((string) $row['code'] === 'HM7278AAA1') {
        $airbnb_nights = (int) $row['nights_in'];
    }
}
T::same(2, $airbnb_nights, 'They are counted once, on the platform stay');

T::group('A confirmed move with no stay is raised, not passed over');

// Take the Airbnb stay away and the move has nothing to link to.
$wpdb->query($wpdb->prepare('DELETE FROM ' . Schema::links() . ' WHERE mphb_booking_id = %d', 7278));
$wpdb->query($wpdb->prepare('DELETE FROM ' . Schema::stays() . ' WHERE id = %d', $airbnb_stay));

T::same(null, Copies::confirmed_move_stay(Copies::CONFIRMED_MOVES[7278], '2025-10-24', '2025-10-26'), 'No stay can be found');
T::same(0, Linker::run(1)['copy'], 'The matcher links nothing for it');
T::ok(in_array('confirmed_move_no_stay:7278', array_column(Issues::all(), 'key'), true), 'And the cleanup list says so');

T::group('A link to no stay at all is refused outright');

$before = count(Repo::all_links());
T::ok(!Repo::link(0, 12443, 'copy', 1), 'Linking to stay 0 is refused');
T::ok(!Repo::link(-1, 12443, 'copy', 1), 'So is a negative stay id');
T::ok(!Repo::link(5, 0, 'copy', 1), 'And a booking id of 0');
T::same($before, count(Repo::all_links()), 'None of them wrote a row');

T::group('Links left pointing at a stay that does not exist');

dccl_reset_db();
dccl_seed_mphb();
dccl_import_all();
Linker::run(1);

$good = count(Repo::all_links());
T::same([], Repair::bad_links(), 'A clean install has none');

// Staging's shape: three rows pointing at stay 0, beside the correct ones,
// exactly as 0.1.3 wrote them.
foreach ([138 => 12443, 139 => 12447, 140 => 17462] as $id => $booking_id) {
    $wpdb->insert(Schema::links(), [
        'id'              => $id,
        'stay_id'         => 0,
        'mphb_booking_id' => $booking_id,
        'method'          => 'copy',
        'linked_at'       => '2026-10-20 20:09:00',
        'linked_by'       => 1,
    ]);
}

T::same(3, count(Repair::bad_links()), 'All three are found');
T::ok(str_contains(Health::bad_links_notice(), '138'), 'The health notice names them');
T::ok(Health::check()['ok'], 'But they do not replace the figures with a banner: no figure is wrong');
T::ok(in_array('bad_links:138-139-140', array_column(Issues::all(), 'key'), true), 'The cleanup list offers to remove them');

$result = Repair::remove_bad_links(1);
T::same(3, $result['removed'], 'All three are removed');
T::same([], Repair::bad_links(), 'None are left');
T::same($good, count(Repo::all_links()), 'And the good links are untouched');

$batch = Batches::get((int) $result['batch_id']);
T::ok($batch !== null, 'The removal is recorded as a batch');
T::same(Repair::KIND, $batch === null ? '' : (string) $batch['kind'], 'Of its own kind, visible on the Imports tab');

T::group('Removing them is undoable, like any batch');

$undo = Batches::undo((int) $result['batch_id']);
T::ok($undo['ok'], 'The batch can be undone');
T::same(3, $undo['restored_links'], 'All three links come back');
T::same(3, count(Repair::bad_links()), 'Exactly as they were, bad stay id and all');

Repair::remove_bad_links(1);
T::same([], Repair::bad_links(), 'And they can be removed again');

T::group('The upgrade removes them by itself');

foreach ([200 => 12443] as $id => $booking_id) {
    $wpdb->insert(Schema::links(), [
        'id'              => $id,
        'stay_id'         => 0,
        'mphb_booking_id' => $booking_id,
        'method'          => 'copy',
        'linked_at'       => '2026-10-20 20:09:00',
        'linked_by'       => 1,
    ]);
}
T::same(1, count(Repair::bad_links()), 'One is waiting');

// What an upgrade does: the stored version is behind, so the routine runs.
update_option(Schema::VERSION_OPTION, '3', false);
DCCL\Plugin::instance()->maybe_upgrade();

T::same([], Repair::bad_links(), 'The upgrade removed it');
T::same(Schema::DB_VERSION, get_option(Schema::VERSION_OPTION), 'And brought the version up to date');

$batches = Batches::all();
$kinds   = array_map(static fn ($b) => (string) $b['kind'], $batches);
T::ok(in_array(Repair::KIND, $kinds, true), 'As a recorded batch, not a silent delete');

T::group('A hand-typed copy whose platform stay was never imported');

dccl_reset_db();
dccl_seed_mphb();
dccl_import_all();

// Before the matcher runs, both are flagged as typed in by hand.
$before = array_column(Issues::all(), 'key');
T::ok(in_array('handtyped:bookingcom:5430432780:8415', $before, true), 'The OK stay is flagged');
T::ok(in_array('handtyped:bookingcom:5965741003:9136', $before, true), 'And so is the cancelled, paid-out one');

Linker::run(1);

$copies = Copies::detect(Copies::from_live());

T::ok(isset($copies[8415]), '#8415 is linked, though its stay has no imported booking of its own');
T::same(Repo::stay_id('bookingcom', '5430432780'), (int) $copies[8415]['stay_id'], 'To its own platform stay');

T::ok(isset($copies[9136]), '#9136 is linked too, though its stay is marked cancelled');
T::same(Repo::stay_id('bookingcom', '5965741003'), (int) $copies[9136]['stay_id'], 'To its own platform stay');

$after = array_column(Issues::all(), 'key');
T::ok(!in_array('handtyped:bookingcom:5430432780:8415', $after, true), 'The flag clears once linked');
T::ok(!in_array('handtyped:bookingcom:5965741003:9136', $after, true), 'For both of them');

T::group('Their money is shown, and counted once');

// The payment items read the ledger's copy of MotoPress, so they appear once
// the snapshot has been taken.
Snapshot::run(false, 1);

$with_money = array_column(Issues::all(), 'key');
T::ok(in_array('copy_payment:8415', $with_money, true), 'The payment on #8415 is raised for Rob to confirm');
T::ok(in_array('copy_payment:9136', $with_money, true), 'And the payment on #9136');

// 31 Jan - 7 Feb and 27 Feb - 1 Mar. Neither booking's money may count as
// direct money any more.
$feb = DCCL\Reports::summary('2026-01-01', '2026-03-31', 'stay', 'ledger');
T::same(0.00, $feb['totals']['direct_recorded'], 'Neither payment counts as direct revenue');
// Four copies fall in this window; the other two carry no payment.
T::same(4, $feb['direct']['copies_excluded'], 'Both are excluded as copies');
T::same(1171.05, $feb['direct']['copy_payments'], 'Their $1,171.05 is shown on the copies, not counted');

T::group('A cancelled stay is only the original of a copy if it was paid out');

// Rob's 5584: a cancelled Vrbo stay with no money at all. A direct booking on
// those nights is a real, separate stay, and must stay that way.
$cancelled_unpaid = Repo::find_stay('vrbo', 'HA-BBB222');
$unpaid = null;
foreach (Copies::stays() as $stay) {
    if ((int) $stay['id'] === (int) $cancelled_unpaid['id']) {
        $unpaid = $stay;
    }
}
T::ok($unpaid !== null, 'The cancelled, unpaid stay is there');
T::ok(!Copies::can_originate_copy($unpaid), 'And cannot be the original of a copy');
T::ok(!isset($copies[9022]), 'So the booking that names its code is still a real stay');

$paid = null;
foreach (Copies::stays() as $stay) {
    if ((string) $stay['code'] === '5965741003') {
        $paid = $stay;
    }
}
T::ok($paid !== null && Copies::can_originate_copy($paid), 'A cancelled stay that WAS paid out can be');
T::same('cancelled', $paid === null ? '' : (string) $paid['status'], 'Even though its status says cancelled');

// A cancellation fee is not money for a stay: nobody stayed. HMCANCEL01 has
// a fee and its refund, and nothing else.
$fee_only = null;
foreach (Copies::stays() as $stay) {
    if ((string) $stay['code'] === 'HMCANCEL01') {
        $fee_only = $stay;
    }
}
T::ok($fee_only !== null, 'The fee-only cancelled stay is there');
T::same(0.0, round((float) ($fee_only['stay_money'] ?? 0), 2), 'It carries no money for the stay itself');
T::ok(!Copies::can_originate_copy($fee_only), 'So a cancellation fee alone cannot make it the original of a copy');

// And the cleanup list must not offer a link the matcher will never make.
T::ok(
    !in_array('handtyped:vrbo:HA-BBB222:9022', array_column(Issues::all(), 'key'), true),
    'A stay that cannot originate a copy is not flagged as having a hand-typed one'
);

T::group('And the nights nobody counts are said out loud');

T::ok(
    in_array('cancelled_with_copy:bookingcom:5965741003', array_column(Issues::all(), 'key'), true),
    'A cancelled stay that was paid out and typed in by hand is raised'
);
