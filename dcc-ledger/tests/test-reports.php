<?php
/**
 * Report maths, against figures worked out by hand from the fixtures.
 *
 * March 2025 holds four platform stays:
 *   HMAAAA0001  cottage 22  07–10 Mar  3 nights  gross 465.00  fee 15.00  tax 40.00  payout 450.00  adjustment +25.00
 *   HMAAAA0002  cottage 31  12–15 Mar  3 nights  gross 310.00  fee 10.00  tax 25.00  payout 300.00
 *   HMMOVED001  cottage 32  20–23 Mar  3 nights  gross 360.00  fee 20.31  tax  0.00  payout 339.69  resolution −339.69
 *   5111111111  cottage 22  01–05 Mar  4 nights  room sales 600.00  commission 90.00  payout 672.00  tax in payout 72.00
 * plus one direct booking, #9011, cottage 23, 20–23 Mar, 3 nights, 388.50 due.
 */

declare(strict_types=1);

use DCCL\Dates;
use DCCL\Importer;
use DCCL\Linker;
use DCCL\Reports;

T::group('Report maths — March 2025, by stay dates');

dccl_seed_mphb();
foreach ([
    'airbnb-payout.csv', 'airbnb-reservations.csv',
    'bookingcom-reservations.csv', 'bookingcom-payout.csv',
    'vrbo-reservations.csv', 'vrbo-payout.csv', 'bookingcom-invoices.csv',
] as $file) {
    Importer::run(dccl_fixture($file), $file, false, 1);
}
Linker::run(1);

$s = Reports::summary('2025-03-01', '2025-03-31', 'stay');
$t = $s['totals'];

T::same(13, $s['ota']['nights'], 'Platform nights in March');
T::same(3, $s['direct']['nights'], 'Direct nights in March');
T::same(16, $t['nights'], 'Total nights in March');
T::same(1807.00, $t['guest_total'], 'Guest total');
T::same(135.31, $t['platform_fees'], 'Commission plus service fees');
T::same(65.00, $t['tax_platform_remitted'], 'Tax Airbnb remitted itself');
T::same(72.00, $t['tax_in_payout'], 'Tax inside the Booking.com payout');
T::same(1447.00, $t['net_payout'], 'Net payout, after the resolution clawback and the adjustment');
T::same(1670.00, $t['room_revenue'], 'Room revenue is the guest total less both taxes');
T::same(128.46, $t['adr'], 'Average nightly rate is room revenue over platform nights');
T::same(248, $t['capacity_nights'], '31 days across 8 cottages');
T::same(6.5, $t['occupancy_pct'], 'Occupancy');
T::same(388.50, $t['direct_due'], 'Direct bookings due');
T::same(0.00, $t['direct_recorded'], 'Nothing recorded against the direct booking');

T::group('Airbnb remitted tax is never revenue');

T::ok($t['room_revenue'] < $t['guest_total'], 'Room revenue is below the guest total');
T::same(round($t['guest_total'] - $t['tax_platform_remitted'] - $t['tax_in_payout'], 2), $t['room_revenue'], 'Both taxes are taken out of room revenue');

T::group('Period splitting across a boundary');

// HMAAAA0001 runs 7–10 March: two of its three nights start on or before 8 March.
T::same(2, Dates::nights_in_period('2025-03-07', '2025-03-10', '2025-03-01', '2025-03-08'), 'Two nights fall inside the shortened period');
T::same(0, Dates::nights_in_period('2025-03-07', '2025-03-10', '2025-04-01', '2025-04-30'), 'None fall in another month');
T::same(3, Dates::nights_in_period('2025-03-07', '2025-03-10', '2025-01-01', '2025-12-31'), 'All three fall inside the year');

$part = Reports::summary('2025-03-06', '2025-03-08', 'stay');
T::same(2, $part['ota']['nights'], 'Only the nights inside the window are counted');
// Two of three nights, so two thirds of the money: 465 × 2/3 = 310.00.
T::same(310.00, $part['totals']['guest_total'], 'Money is split by the nights inside the window');
// 450.00 paid out plus the 25.00 adjustment, two thirds of each.
T::same(316.67, $part['totals']['net_payout'], 'The payout and its adjustment are both split two thirds');

T::group('Report maths — March 2025, by payout date');

$cash = Reports::summary('2025-03-01', '2025-03-31', 'payout');
$c    = $cash['totals'];

T::same(16, $c['nights'], 'Nights do not move with the cash basis');
T::same(1761.69, $c['net_payout'], 'Cash in March: the 5 March Airbnb payout and the 10 March Booking.com payout');
T::same(1807.00, $c['guest_total'], 'Guest totals dated by their payout');
T::same(72.00, $c['tax_in_payout'], 'The derived tax is dated by the payout');

$april = Reports::summary('2025-04-01', '2025-04-30', 'payout');
T::same(-339.69, $april['ota']['resolution'], 'The April resolution adjustment lands in April on the cash basis');

T::group('Vrbo tax is unknown, not zero');

$july = Reports::summary('2025-07-01', '2025-07-31', 'stay');
T::ok(in_array('vrbo', $july['ota']['tax_not_reported'], true), 'Vrbo is reported as not reporting tax');
T::same(0.0, $july['ota']['tax_in_payout'], 'Its stored tax figure is zero, as the file says');
T::ok(!in_array('bookingcom', Reports::summary('2025-03-01', '2025-03-31', 'stay')['ota']['tax_not_reported'], true), 'Booking.com does report tax, so it is not listed');

T::group('A copy is counted once');

// Booking #9006 is a hand-typed copy of Booking.com 5555555555 (cottage 35,
// 10–14 June). Only the platform stay's four nights may be counted.
$june = Reports::summary('2025-06-01', '2025-06-30', 'stay');
T::same(4, $june['ota']['nights'], 'The platform stay contributes its four nights');
T::same(0, $june['direct']['nights'], 'The copy contributes none');
T::same(1, $june['direct']['copies_excluded'], 'The copy is counted as excluded');
T::same(333.00, $june['direct']['copy_payments'], 'The payment on the copy is shown');
T::same(0.00, $june['totals']['direct_recorded'], 'But it is not counted as money received');

T::group('Recorded and assumed payments stay apart');

$may = Reports::summary('2025-05-01', '2025-05-31', 'stay');
T::same(600.00, $may['totals']['direct_assumed'], 'The assumed top-up is reported as assumed');
T::same(0.00, $may['totals']['direct_recorded'], 'And not as recorded');

$april_direct = Reports::summary('2025-04-01', '2025-04-30', 'stay');
T::same(500.00, $april_direct['totals']['direct_recorded'], 'A real payment is reported as recorded');
T::same(0.00, $april_direct['totals']['direct_assumed'], 'And not as assumed');

T::group('Cancellations and lead time');

$may_cancel = Reports::summary('2025-05-01', '2025-05-31', 'stay');
T::same(1, $may_cancel['totals']['cancellations'], 'The cancelled Airbnb stay is counted in its check-in month');
T::same(0.00, $may_cancel['totals']['cancellation_fees'], 'Its fee and the fee refund cancel out');

// HMAAAA0001 booked 10 Jan for 7 Mar (56 days); HMAAAA0002 booked 15 Jan for
// 12 Mar (56 days); HMMOVED001 booked 1 Feb for 20 Mar (47 days);
// 5111111111 booked 10 Feb for 1 Mar (19 days). Median of 19, 47, 56, 56 is
// 51.5, reported as whole days.
T::same(52, $s['totals']['lead_time_median'], 'Median lead time');

T::group('The reconciled window');

T::same('2026-09-30', $s['reconciled_through'], 'The reconciled-through marker travels with every summary');
T::ok(!$s['beyond_window'], 'March 2025 is inside the window');
T::ok(Reports::summary('2026-10-01', '2026-10-31', 'stay')['beyond_window'], 'October 2026 is past it');

T::group('Report cache');

Reports::flush_cache();
$first = Reports::summary('2025-03-01', '2025-03-31', 'stay');
$key   = Reports::cache_key(['summary', '2025-03-01', '2025-03-31', 'stay']);
T::ok(Reports::cache_get($key) !== null, 'A summary is cached');
Importer::run(dccl_fixture('airbnb-payout.csv'), 'airbnb-payout.csv', false, 1);
T::same(null, Reports::cache_get($key), 'An import clears the cache');
