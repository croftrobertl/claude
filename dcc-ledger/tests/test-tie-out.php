<?php
/**
 * The parts add up.
 *
 * Rob's standard: every number on a Ledger screen would survive an outside
 * audit with no adjusting entries. The first thing an auditor does is add
 * the months up and compare them with the year. So does this.
 *
 * It is only possible to assert exactly because money is whole cents. The
 * same test on floats would need a tolerance, and a tolerance is where a
 * missing cent hides.
 */

declare(strict_types=1);

use DCCL\Cottages;
use DCCL\Linker;
use DCCL\Reports;
use DCCL\Snapshot;

dccl_seed_mphb();
dccl_import_all();
Linker::run(1);
Snapshot::run(false, 1);

/** The months the fixtures span, inclusive. */
$months = [];
$cursor = new DateTimeImmutable('2025-01-01');
$end    = new DateTimeImmutable('2026-12-01');
while ($cursor <= $end) {
    $months[] = $cursor->format('Y-m');
    $cursor   = $cursor->modify('+1 month');
}

$from = '2025-01-01';
$to   = '2026-12-31';

foreach (['stay', 'payout'] as $basis) {
    T::group('Twelve plus twelve months equal two years, on the ' . $basis . ' basis');

    $whole = Reports::summary($from, $to, $basis);

    $fields = [
        'guest_total', 'platform_fees', 'net_payout', 'room_revenue',
        'tax_platform_remitted', 'tax_in_payout', 'nights',
        'direct_due', 'direct_recorded', 'direct_assumed',
        'direct_assumed_pre_exports', 'direct_refunds', 'direct_paid',
    ];

    $summed = array_fill_keys($fields, 0);
    foreach ($months as $month) {
        $start = $month . '-01';
        $stop  = (new DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
        $part  = Reports::summary($start, $stop, $basis);
        foreach ($fields as $field) {
            $summed[$field] += (int) $part['totals'][$field];
        }
    }

    foreach ($fields as $field) {
        T::same(
            (int) $whole['totals'][$field],
            $summed[$field],
            $field . ' ties to the cent across every month'
        );
    }
}

T::group('Every channel adds up to the whole');

$whole = Reports::summary($from, $to, 'stay');

foreach (['guest_total', 'payout', 'commission', 'service_fee', 'nights'] as $field) {
    $sum = 0;
    foreach ($whole['by_channel'] as $row) {
        $sum += (int) ($row[$field] ?? 0);
    }
    T::same((int) $whole['ota'][$field] + ($field === 'nights' ? (int) $whole['direct']['nights'] : 0), $sum, $field . ' ties across the channels');
}

T::group('Every cottage adds up to the whole');

foreach (['guest_total', 'payout', 'nights'] as $field) {
    $sum = 0;
    foreach ($whole['by_cottage'] as $cottage => $row) {
        T::ok(in_array((string) $cottage, Cottages::COTTAGES, true), 'Cottage ' . $cottage . ' is one of the eight');
        $sum += (int) ($row[$field] ?? 0);
    }
    T::same(
        (int) $whole['ota'][$field] + ($field === 'nights' ? (int) $whole['direct']['nights'] : 0),
        $sum,
        $field . ' ties across the cottages'
    );
}

T::group('A stay split across a month end loses nothing');

// HM7278AAA1 runs 24–26 October, so it does not cross one. The Booking.com
// reservation 5430432780 runs 31 January to 7 February 2026: one night in
// January, six in February. Whatever the split, the two months together must
// equal the stay entire.
$jan  = Reports::summary('2026-01-01', '2026-01-31', 'stay');
$feb  = Reports::summary('2026-02-01', '2026-02-28', 'stay');
$both = Reports::summary('2026-01-01', '2026-02-28', 'stay');

foreach (['guest_total', 'net_payout', 'room_revenue', 'nights'] as $field) {
    T::same(
        (int) $both['totals'][$field],
        (int) $jan['totals'][$field] + (int) $feb['totals'][$field],
        'January plus February equals the pair, for ' . $field
    );
}

T::group('The three views reconcile');

$original   = Reports::summary($from, $to, 'stay', 'original');
$ledger     = Reports::summary($from, $to, 'stay', 'ledger');
$difference = Reports::summary($from, $to, 'stay', 'difference');

T::same(
    (int) $ledger['totals']['direct_paid'],
    (int) $original['totals']['direct_paid'] + (int) $difference['totals']['direct_paid'],
    'Original plus Difference equals Ledger, to the cent'
);
T::same(
    0,
    (int) $original['totals']['direct_assumed'] + (int) $original['totals']['direct_assumed_pre_exports'],
    'The Original view carries no assumption of either kind'
);
