<?php
/**
 * "That one really was stayed."
 *
 * The known gap, closed. A cancelled platform reservation with a hand-typed
 * copy attached had its nights counted nowhere — the reservation contributes
 * none because the platform says nobody came, the copy contributes none
 * because it is a copy. Harmless while the screens showed only money;
 * wrong the moment they show occupancy.
 */

declare(strict_types=1);

use DCCL\Issues;
use DCCL\Linker;
use DCCL\Reports;
use DCCL\Repo;
use DCCL\Snapshot;
use DCCL\Stay_Rulings;

dccl_seed_mphb();
dccl_import_all();
Linker::run(1);
Snapshot::run(false, 1);

// 5333333333 is cancelled, in cottage 34 for 2–5 April 2025, and Booking.com
// paid out $200 for it. Attach a hand-typed booking, which is the shape that
// leaves its nights homeless.
$stay_id = Repo::stay_id('bookingcom', '5333333333');
T::ok($stay_id !== null, 'The cancelled stay with money is there');
T::ok(Repo::link((int) $stay_id, 9009, 'copy', 1), 'A hand-typed copy is attached to it');

$period = ['2025-04-01', '2025-04-30'];

T::group('Before anybody rules on it');

$before = Reports::summary($period[0], $period[1], 'stay');
$keys   = array_column(Issues::all(), 'key');

T::ok(in_array('cancelled_with_copy:bookingcom:5333333333', $keys, true), 'The cleanup list raises it');
T::ok(!in_array('stayed_ruled:bookingcom:5333333333', $keys, true), 'And does not pretend it has been ruled');
T::same(null, Stay_Rulings::current((int) $stay_id), 'No ruling stands against it');

T::group('A ruling needs a person, a reason, and a stay that exists');

T::same(
    false,
    Stay_Rulings::rule((int) $stay_id, 'money', '', 1)['ok'],
    'A ruling with no note is refused: a reason is the whole point'
);
T::same(
    false,
    Stay_Rulings::rule((int) $stay_id, 'hunch', 'It feels right', 1)['ok'],
    'And so is one resting on something that is not evidence'
);
T::same(
    false,
    Stay_Rulings::rule(999999, 'word', 'Rob remembers it', 1)['ok'],
    'And one about a stay that does not exist'
);
T::same(null, Stay_Rulings::current((int) $stay_id), 'None of those wrote anything');

T::group('Ruled as stayed');

$result = Stay_Rulings::rule((int) $stay_id, Stay_Rulings::EVIDENCE_MONEY, 'Booking.com paid out BDC-PAYOUT-0410 for it.', 1);
T::ok($result['ok'], 'A ruling with its evidence named is recorded');

$ruling = Stay_Rulings::current((int) $stay_id);
T::ok($ruling !== null, 'And it stands against the stay');
T::same('money', (string) $ruling['evidence'], 'With what it rests on');
T::same('Booking.com paid out BDC-PAYOUT-0410 for it.', (string) $ruling['note'], 'And the note that names it');

T::same(
    false,
    Stay_Rulings::rule((int) $stay_id, 'word', 'Again', 1)['ok'],
    'It cannot be ruled twice'
);

T::group('Its nights and its money now count, once');

$after = Reports::summary($period[0], $period[1], 'stay');

T::same(
    (int) $before['totals']['nights'] + 3,
    (int) $after['totals']['nights'],
    'The three nights are in the figures'
);
T::ok(
    (int) $after['totals']['net_payout'] > (int) $before['totals']['net_payout'],
    'And so is the money the platform paid out for it'
);
T::same(
    (int) $after['totals']['nights'],
    (int) $after['ota']['nights'] + (int) $after['direct']['nights'],
    'The parts still add up'
);

$keys_after = array_column(Issues::all(), 'key');
T::ok(in_array('stayed_ruled:bookingcom:5333333333', $keys_after, true), 'The cleanup list records the ruling');
T::ok(!in_array('cancelled_with_copy:bookingcom:5333333333', $keys_after, true), 'And stops asking the question');
T::same('info', dccl_issue_severity(Issues::all(), 'stayed_ruled:bookingcom:5333333333'), 'As information, not work');

T::group('Counted once, not twice');

// The hand-typed copy is still a copy. Its own money must not appear beside
// the platform stay's.
$copies = Reports::direct_copy_ids();
T::ok(isset($copies[9009]), 'The hand-typed booking is still counted as a copy');

T::group('Taken back');

T::ok(Stay_Rulings::revoke((int) $stay_id, 1), 'The ruling can be revoked');
T::same(null, Stay_Rulings::current((int) $stay_id), 'Nothing stands against the stay any more');
// One row carrying both halves: when it was made, and when it was taken
// back. Nothing is deleted, so the decision and its withdrawal are both
// readable afterwards.
$history = Stay_Rulings::history();
T::same(1, count($history), 'The ruling is still there, not deleted');
T::ok((string) $history[0]['created_at'] !== '', 'Carrying when it was made');
T::ok($history[0]['revoked_at'] !== null, 'And when it was taken back');
T::same(
    (int) $before['totals']['nights'],
    (int) Reports::summary($period[0], $period[1], 'stay')['totals']['nights'],
    'And the nights go back to being counted nowhere'
);
T::ok(
    in_array('cancelled_with_copy:bookingcom:5333333333', array_column(Issues::all(), 'key'), true),
    'So the question comes back on the list'
);
T::same(false, Stay_Rulings::revoke((int) $stay_id, 1), 'Revoking twice does nothing');
