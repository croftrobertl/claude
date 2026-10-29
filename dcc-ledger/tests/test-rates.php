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
T::same(2, count($audit), 'Both invariants are checked');
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
