<?php
/**
 * The two money errors the Director found on live, and the rules that stop
 * them coming back.
 *
 * Both were wrong in a way no screen showed: net came out ABOVE gross for
 * Booking.com, and a payout whose reservation row had not arrived put its
 * money into the average rate with no nights under it.
 */

declare(strict_types=1);

use DCCL\Audit;
use DCCL\Schema;
use DCCL\Linker;
use DCCL\Reports;
use DCCL\Repo;
use DCCL\Snapshot;

dccl_seed_mphb();
dccl_import_all();
Linker::run(1);
Snapshot::run(false, 1);

T::group('A Booking.com payout is not net');

// Booking.com pays the room rate AND the tax Rob has to remit, and invoices
// its commission separately rather than deducting it. So its payout is
// above its own gross room revenue — which is exactly how taking the payout
// as "net" produced a net ADR higher than the gross one.
// March 2025 is the month with the whole shape: a reservation row giving
// Final amount and commission, and a payout above both because it carries
// the tax.
$march = Reports::summary('2025-03-01', '2025-03-31', 'stay');
$bcom  = $march['by_channel']['bookingcom'] ?? [];

T::ok(($bcom['payout'] ?? 0) > 0, 'Booking.com paid out in March');
T::ok(
    (int) ($bcom['tax_in_payout'] ?? 0) > 0,
    'And its payout carries the tax Rob remits, derived from payout less Final amount'
);
T::ok((int) ($bcom['commission'] ?? 0) > 0, 'With its commission invoiced separately');
T::ok(
    (int) ($bcom['payout'] ?? 0) > (int) ($bcom['room_revenue'] ?? 0),
    'So the payout is ABOVE gross room revenue — the shape that broke it'
);
T::same(
    (int) ($bcom['room_revenue'] ?? 0) - (int) ($bcom['commission'] ?? 0) - (int) ($bcom['service_fee'] ?? 0),
    (int) ($bcom['room_revenue_net'] ?? 0),
    'Net is gross less commission and fees, so it lands below the payout'
);
T::ok(
    (int) ($bcom['room_revenue_net'] ?? 0) <= (int) ($bcom['room_revenue'] ?? 0),
    'And below gross, which is the whole point'
);

T::group('Money with no nights under it stays out of the rate');

$stay_id = Repo::stay_id('bookingcom', '5722711078');
T::ok($stay_id !== null, 'The payout with no reservation row is a stay');

$stay = Repo::stay_by_id((int) $stay_id);
T::same(null, $stay['check_out'], 'With no check-out of its own, because no reservation row explains it');

// Unlinked: its nights are unknown, so its money is reported but kept out
// of every rate.
foreach (Repo::links_for_stay((int) $stay_id) as $link) {
    Repo::unlink((int) $link['id']);
}
Reports::flush_cache();

$unlinked = Reports::summary('2026-09-01', '2026-09-30', 'stay');
$u        = $unlinked['totals'];

T::ok((int) $u['stays_without_nights'] > 0, 'It is counted as a stay whose nights are unknown');
T::ok((int) $u['money_without_nights'] > 0, 'And its money is named');
T::same(
    (int) $u['room_revenue_gross'] - (int) $u['money_without_nights'],
    (int) $u['rate_gross'],
    'The rate divides only the money that has nights under it'
);
T::ok(
    (int) $u['rate_gross'] < (int) $u['room_revenue_gross'],
    'Which is less than the money reported, as it should be'
);

T::group('Linked, it takes its dates from the booking');

// 9052 runs 28 September to 1 October. Linking it gives the payout-only
// stay three nights in September and none in October — read from MotoPress,
// never written to it.
$before_nights = (int) $unlinked['totals']['nights'];
T::ok($before_nights > 0, 'There are nights in September to begin with');
T::ok(Repo::link((int) $stay_id, 9052, 'copy', 1), 'The payout is linked to the booking that explains it');
Reports::flush_cache();

$linked = Reports::summary('2026-09-01', '2026-09-30', 'stay');
$l      = $linked['totals'];

T::same(0, (int) $l['stays_without_nights'], 'Its nights are no longer unknown');
T::same(0, (int) $l['money_without_nights'], 'So none of its money is out of the rate');
T::ok((int) $l['nights_from_link'] > 0, 'And the ledger says it took the dates from a link');
// The booking is now a copy of the platform stay, so its nights move from
// the direct side to the platform side and are counted once, not twice.
T::ok((int) $linked['ota']['nights'] > (int) $unlinked['ota']['nights'], 'The platform stay gains the nights the booking knows about');
T::ok((int) $linked['direct']['nights'] < (int) $unlinked['direct']['nights'], 'And the booking stops contributing them itself');
T::same($before_nights, (int) $l['nights'], 'So the total is unchanged: the same nights, counted once');
T::same(
    (int) $l['room_revenue_gross'],
    (int) $l['rate_gross'],
    'With nights under all of it, every dollar is in the rate'
);

T::group('Its money is split across the month end by those nights');

$october = Reports::summary('2026-10-01', '2026-10-31', 'stay');
$whole   = Reports::summary('2026-09-01', '2026-10-31', 'stay');

T::same(
    (int) $whole['totals']['room_revenue_gross'],
    (int) $l['room_revenue_gross'] + (int) $october['totals']['room_revenue_gross'],
    'September plus October equals the pair, to the cent'
);

T::group('Nothing in MotoPress was touched to do any of it');

global $wpdb;
$wpdb->writes = [];
Reports::flush_cache();
Reports::summary('2026-09-01', '2026-09-30', 'stay');
T::same([], $wpdb->mphb_writes(), 'Reading a booking\'s dates writes nothing to posts or postmeta');

T::group('The audit runs the same two rules over the stored data');

$audit = Audit::run('2025-01-01', '2026-09-30');
T::same(4, count($audit), 'Every invariant is checked');
T::same(
    [
        'net is never above gross',
        'no money in a rate without nights',
        'no nights in a rate without money',
        'the months add up to the range',
    ],
    array_column($audit, 'what'),
    'And each is named, so the output says what was looked at'
);
foreach ($audit as $check) {
    T::ok($check['ok'], 'Audit: ' . $check['what'] . ' — ' . $check['detail']);
}

T::group('The audit names a figure that breaks its own rule');

// Make net exceed gross the only way the data can: a commission recorded as
// a credit rather than a cost. Nothing in the plugin writes one, which is
// why the audit exists — it is there for the data, not for the code.
$bad = Repo::stay_id('bookingcom', '5111111111');
$wpdb->insert(Schema::lines(), [
    'channel'      => 'bookingcom',
    'type'         => 'commission',
    'amount'       => '-5000.00',
    'amount_cents' => -500000,
    'event_date'   => '2025-03-05',
    'stay_id'      => (int) $bad,
    'hash'         => 'audit-probe',
    'created_at'   => '2025-03-05 00:00:00',
]);
Reports::flush_cache();

$broken = Audit::run('2025-03-01', '2025-03-31');
$net_check = $broken[0];

T::ok(!$net_check['ok'], 'The audit fails rather than passing it over');
T::ok(str_contains($net_check['detail'], '2025-03-01'), 'And names the month');
T::ok(str_contains($net_check['detail'], 'bookingcom'), 'And the channel');
T::ok(str_contains($net_check['detail'], 'above gross'), 'Saying what is wrong with it');

$wpdb->query("DELETE FROM " . Schema::lines() . " WHERE hash = 'audit-probe'");
Reports::flush_cache();

T::ok(Audit::run('2025-03-01', '2025-03-31')[0]['ok'], 'And passes again once the bad row is gone');

T::group('The audit names nights in a rate with no money under them');

// October 2026's fault, the other way up from September's: 43 nights, all
// direct, with $549.17 recorded against $6,027.30 earned. Taking receipts
// as revenue gave an ADR of $12.77. The guard is that no night divides a
// rate unless there is room revenue under it — so a month whose rate
// nights have no revenue at all is named.
$probe = Audit::run('2026-10-01', '2026-10-31');
$by_name = [];
foreach ($probe as $check) {
    $by_name[$check['what']] = $check;
}

T::ok(isset($by_name['no nights in a rate without money']), 'The invariant is among those checked');
T::ok($by_name['no nights in a rate without money']['ok'], 'And October passes it now');

$october = Reports::summary('2026-10-01', '2026-10-31', 'stay');
T::ok((int) $october['totals']['rate_nights'] > 0, 'October has nights in its rate');
T::ok(
    (int) $october['totals']['rate_gross'] > (int) $october['totals']['direct_recorded'],
    'And divides what those nights earned, not only what has been paid'
);
T::same(
    (int) $october['direct']['due'] + (int) $october['totals']['room_revenue'],
    (int) $october['totals']['room_revenue_gross'],
    'Which is the booking totals plus the platforms\' room revenue'
);

T::group('A direct night with no money does not divide the rate');

// 9053 is a confirmed booking with a total of nothing — a comp, or one Rob
// has not priced. Four nights in July 2026. It belongs in occupancy and
// nowhere near the average rate.
$july = Reports::summary('2026-07-01', '2026-07-31', 'stay');
$j    = $july['totals'];

T::ok((int) $j['nights'] > 0, 'July has nights');
T::same(4, (int) $july['direct']['nights_without_revenue'], 'Four of them have no money above them');
T::same(
    (int) $july['ota']['nights_with_revenue'] + (int) $july['direct']['nights_with_revenue'],
    (int) $j['rate_nights'],
    'And the rate divides by the rest'
);
T::ok(
    (int) $j['rate_nights'] < (int) $j['nights'],
    'So the rate nights are fewer than the occupied nights'
);
T::ok(
    (int) $j['nights_without_revenue'] >= 4,
    'And the screen is told how many were left out'
);

T::group('The audit holds for a range that starts and ends mid-month');

// Clamped to the range: whole months against a part-month range would
// never tie, and the check would be reporting a fault of its own making.
foreach (Audit::run('2025-01-15', '2026-09-20') as $check) {
    T::ok($check['ok'], 'Part-month range: ' . $check['what'] . ' — ' . $check['detail']);
}
