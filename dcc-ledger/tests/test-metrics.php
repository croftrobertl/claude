<?php
/**
 * The hotel metrics, and the arithmetic behind each one.
 *
 * Every figure here is checked against its own definition rather than
 * against a number somebody once wrote down: the division is re-done from
 * the parts the screen also shows, so a reader can do the same.
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

$from = '2025-01-01';
$to   = '2025-12-31';
$s    = Reports::summary($from, $to, 'stay');
$t    = $s['totals'];

T::group('Occupancy');

T::same(
    365 * count(Cottages::COTTAGES),
    (int) $t['capacity_nights'],
    'Available nights are eight cottages times every night in the range'
);
T::same(
    round((int) $t['nights'] / (int) $t['capacity_nights'] * 100, 1),
    (float) $t['occupancy_pct'],
    'Occupancy is occupied nights over available nights'
);
T::ok((int) $t['nights'] > 0 && (int) $t['nights'] < (int) $t['capacity_nights'], 'And lands between none and all of them');

T::group('ADR divides by the nights that carry money');

T::same(
    (int) $s['ota']['nights_with_revenue'] + (int) $s['direct']['nights'],
    (int) $t['rate_nights'],
    'The rate nights are the ones with money, plus every direct booking'
);
T::ok(
    (int) $t['rate_nights'] <= (int) $t['nights'],
    'Which is never more than the nights occupancy counts'
);
T::same(
    (int) $t['nights'],
    (int) $s['ota']['nights_with_revenue'] + (int) $s['ota']['nights_without_revenue'] + (int) $s['direct']['nights'],
    'And every occupied night is in one bucket or the other'
);

T::same(
    Reports::per_night((int) $t['room_revenue_gross'], (int) $t['rate_nights']),
    $t['adr_gross'],
    'ADR gross is gross room revenue over those nights'
);
T::same(
    Reports::per_night((int) $t['room_revenue_net'], (int) $t['rate_nights']),
    $t['adr_net'],
    'ADR net is net room revenue over the same nights'
);
T::ok((int) $t['adr_net'] <= (int) $t['adr_gross'], 'Net is never above gross: commission only goes one way');

T::group('RevPAR divides by every available night');

T::same(
    Reports::per_night((int) $t['room_revenue_gross'], (int) $t['capacity_nights']),
    $t['revpar_gross'],
    'RevPAR gross is gross room revenue over available nights'
);
T::same(
    Reports::per_night((int) $t['room_revenue_net'], (int) $t['capacity_nights']),
    $t['revpar_net'],
    'And RevPAR net the same, after commission'
);
T::ok((int) $t['revpar_gross'] <= (int) $t['adr_gross'], 'RevPAR never exceeds ADR below full occupancy');

T::group('Gross and net are the same money, seen before and after the cut');

// On the stay basis a direct booking's room revenue is its booking total
// LESS the room tax inside that total, paid or not. Dividing receipts by
// nights instead gave October an ADR of $12.77 on 43 nights that had
// earned $6,027.30; leaving the tax in overstates every direct rate.
T::same(
    (int) $t['room_revenue'] + (int) $s['direct']['room_revenue'],
    (int) $t['room_revenue_gross'],
    'Gross is the platforms\' room revenue plus what the direct bookings earned'
);
T::ok((int) $s['direct']['tax'] > 0, 'And the tax inside the direct totals was taken out of it');
T::same(
    (int) $s['direct']['due'] - (int) $s['direct']['tax'] - (int) $s['direct']['tax_unknown_money'],
    (int) $s['direct']['room_revenue'],
    'Room revenue is the totals, less their tax, less the totals whose tax is unknown'
);
// Due is not always above paid: an overpaid booking is exactly the case
// the cleanup list raises, so this is not asserted as an invariant.

$cash = Reports::summary($from, $to, 'payout');
T::same(
    (int) $cash['ota']['billed'] - (int) $cash['ota']['tax_in_payout'] - (int) $cash['ota']['tax_platform_remitted']
        + (int) $cash['ota']['refund'] + (int) $cash['direct']['paid_room_revenue'],
    (int) $cash['totals']['room_revenue_gross'],
    'On the cash basis it is money received, not money earned'
);
T::ok(
    (int) $cash['direct']['paid_room_revenue'] < (int) $cash['direct']['paid'],
    'With the tax inside the receipts taken out of them too'
);
// Net is gross less what the platform took, on one definition for every
// channel. Taking the payout as net was wrong for Booking.com twice over:
// its payout carries the tax Rob remits, and its commission is invoiced
// separately rather than deducted — so net came out ABOVE gross.
T::same(
    (int) $t['room_revenue_gross'] - (int) $s['ota']['commission'] - (int) $s['ota']['service_fee'],
    (int) $t['room_revenue_net'],
    'Net is gross less commission and fees, never the payout'
);
T::ok(
    (int) $t['room_revenue_gross'] >= (int) $t['room_revenue_net'],
    'And gross is never below net'
);
T::ok((int) $t['adr_net'] <= (int) $t['adr_gross'], 'Nor is ADR gross below ADR net');
T::ok((int) $t['revpar_net'] <= (int) $t['revpar_gross'], 'Nor RevPAR');

T::group('Net never exceeds gross, in any month, channel or cottage');

foreach (['2025', '2026'] as $year) {
    for ($m = 1; $m <= 12; $m++) {
        $start = sprintf('%s-%02d-01', $year, $m);
        $stop  = (new DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
        $month = Reports::summary($start, $stop, 'stay');

        T::ok(
            (int) $month['totals']['room_revenue_net'] <= (int) $month['totals']['room_revenue_gross'],
            $start . ': net is at or below gross'
        );
        foreach ($month['by_channel'] as $channel => $row) {
            T::ok(
                (int) ($row['room_revenue_net'] ?? 0) <= (int) ($row['room_revenue'] ?? 0),
                $start . ' ' . $channel . ': net is at or below gross'
            );
        }
        foreach ($month['by_cottage'] as $cottage => $row) {
            T::ok(
                (int) ($row['room_revenue_net'] ?? 0) <= (int) ($row['room_revenue'] ?? 0),
                $start . ' cottage ' . $cottage . ': net is at or below gross'
            );
        }
    }
}

T::group('Length of stay counts a stay whole, in the month it begins');

T::ok((int) $t['stays_counted'] > 0, 'There are stays to measure');
T::ok((int) $t['length_of_stay_median'] >= 1, 'The median is at least one night');
T::ok((int) $t['length_of_stay_mean'] >= 1, 'And so is the mean');

// A stay is counted once, whole, in the month it begins — never split and
// never counted twice. Summing the months must give exactly the same stays,
// and the same nights, as the whole year does.
$year        = Reports::summary('2026-01-01', '2026-12-31', 'stay');
$year_lengths = $year['ota']['stay_lengths'];
sort($year_lengths);

$by_month = [];
for ($m = 1; $m <= 12; $m++) {
    $start = sprintf('2026-%02d-01', $m);
    $stop  = (new DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
    foreach (Reports::summary($start, $stop, 'stay')['ota']['stay_lengths'] as $length) {
        $by_month[] = $length;
    }
}
sort($by_month);

T::same($year_lengths, $by_month, 'Every stay is counted once, in the month it begins, at its whole length');

// HMCROSS001 runs 28 April to 3 May 2026: three nights in April (the 28th,
// 29th and 30th) and two in May. Its length is five, counted in April.
// Its length is five, counted in April, and it appears in no other month.
$april = Reports::summary('2026-04-01', '2026-04-30', 'stay');
$may   = Reports::summary('2026-05-01', '2026-05-31', 'stay');

T::ok(in_array(5, $april['ota']['stay_lengths'], true), 'A stay crossing the month end is five nights long, not the three inside April');
T::ok(!in_array(2, $may['ota']['stay_lengths'], true), 'And May does not count the two nights it ends with as a stay of its own');
T::same(3, (int) $april['ota']['nights'], 'April still counts only the nights that fall in April');
T::same(2, (int) $may['ota']['nights'], 'And May the two that fall in May');

T::group('Lead time is split, never blended');

T::ok($t['lead_time_median'] !== null, 'There is a platform lead time');
T::ok((int) $t['lead_time_count'] > 0, 'Over a named number of stays');
T::ok(
    $t['direct_lead_time_median'] === null || (int) $t['direct_lead_time_count'] > 0,
    'And a direct one, or none at all — never a blend of the two'
);
T::ok(
    !array_key_exists('lead_time_all', $t),
    'No combined figure exists to be read by mistake'
);

T::group('A rate with nothing behind it is unknown, not zero');

// A range before the exports begin: no platform stays, so no rate.
$empty = Reports::summary('2024-01-01', '2024-01-31', 'stay')['totals'];
T::same(0, (int) $empty['rate_nights'], 'No nights carry money in that range');
T::same(null, $empty['adr_gross'], 'So ADR is unknown');
T::same(null, $empty['adr_net'], 'And so is ADR net');
T::same(null, $empty['length_of_stay_median'], 'And the length of stay');
T::same(null, $empty['lead_time_median'], 'And the lead time');

T::group('The medians round the way the definitions say');

T::same(3, Reports::median([1, 3, 5]), 'An odd count takes the middle');
T::same(52, Reports::median([51, 52]), 'An even count rounds the two middles half up');
T::same(null, Reports::median([]), 'Nothing has no median');
T::same(2, Reports::mean([1, 2, 2]), 'The mean rounds half up too');
T::same(null, Reports::mean([]), 'And nothing has no mean');
T::same(null, Reports::per_night(1000, 0), 'No nights is not a rate of nothing');
T::same(3333, Reports::per_night(10000, 3), 'A third of $100 a night is $33.33');
