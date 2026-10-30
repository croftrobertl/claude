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
T::same(5, count($audit), 'Every invariant is checked');
T::same(
    [
        'net is never above gross',
        'no money in a rate without nights',
        'no nights in a rate without money',
        'tax comes out of a total, never into it',
        'the months add up to the range',
    ],
    array_column($audit, 'what'),
    'And each is named, so the output says what was looked at'
);
foreach ($audit as $check) {
    T::ok($check['ok'], 'Audit: ' . $check['what'] . ' — ' . $check['detail']);
}

T::group('A stay whose money will not divide evenly still ties across the month end');

// The defect of 0.3.2, in the shape the Director found it: a stay of two
// nights whose money is an odd number of cents. Half of it is x.5, and
// rounding each month's half on its own rounds BOTH of them up — so the
// two months came to a cent more than the year. The fixtures had no stay
// like it, which is why only the real data showed it.
global $wpdb;
$wpdb->insert(Schema::stays(), [
    'channel'    => 'airbnb',
    'code'       => 'HMSPLIT001',
    'cottage'    => '22',
    'check_in'   => '2025-05-31',
    'check_out'  => '2025-06-02',
    'nights'     => 2,
    'status'     => 'ok',
    'created_at' => '2025-05-01 00:00:00',
    'updated_at' => '2025-05-01 00:00:00',
]);
$odd = (int) Repo::stay_id('airbnb', 'HMSPLIT001');
foreach ([['guest_total', 49463], ['payout', 44517], ['commission', 1483]] as [$type, $cents]) {
    $wpdb->insert(Schema::lines(), [
        'stay_id'      => $odd,
        'channel'      => 'airbnb',
        'type'         => $type,
        'amount'       => \DCCL\Money::to_decimal($cents),
        'amount_cents' => $cents,
        'event_date'   => '2025-05-31',
        'hash'         => 'split-probe-' . $type,
        'created_at'   => '2025-05-01 00:00:00',
    ]);
}
Reports::flush_cache();

$pair = Reports::summary('2025-05-01', '2025-06-30', 'stay');
$may  = Reports::summary('2025-05-01', '2025-05-31', 'stay');
$june = Reports::summary('2025-06-01', '2025-06-30', 'stay');

T::same(
    (int) $pair['totals']['guest_total'],
    (int) $may['totals']['guest_total'] + (int) $june['totals']['guest_total'],
    'An odd number of cents over two nights: the months come to the pair exactly'
);
T::same(
    (int) $pair['totals']['room_revenue_gross'],
    (int) $may['totals']['room_revenue_gross'] + (int) $june['totals']['room_revenue_gross'],
    'And so does gross room revenue'
);

$year   = Reports::summary('2025-01-01', '2025-12-31', 'stay');
$months = 0;
for ($m = 1; $m <= 12; $m++) {
    $first  = sprintf('2025-%02d-01', $m);
    $last   = date('Y-m-t', (int) strtotime($first));
    $months += (int) Reports::summary($first, $last, 'stay')['totals']['guest_total'];
}
T::same((int) $year['totals']['guest_total'], $months, 'And the twelve months of 2025 come to the year, to the cent');

$split_audit = Audit::run('2025-01-01', '2025-12-31');
foreach ($split_audit as $check) {
    T::ok($check['ok'], 'With the odd stay in it: ' . $check['what'] . ' — ' . $check['detail']);
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
    (int) $october['direct']['room_revenue'] + (int) $october['totals']['room_revenue'],
    (int) $october['totals']['room_revenue_gross'],
    'Which is the booking totals net of tax, plus the platforms\' room revenue'
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

T::group('A direct booking\'s room revenue is its total less the tax inside it');

// Established on live on 2026-10-30, read-only and in aggregate:
// `_mphb_booking_price_breakdown` is present on 281 booking rows; of 117
// confirmed bookings sampled with one, 76 list room taxes; the breakdown's
// total equals `mphb_total_price` on 116 of the 117; and no services
// appear in any breakdown. So the total INCLUDES tax, and room revenue —
// which excludes tax — cannot be the total.
$january = Reports::summary('2025-01-01', '2025-01-31', 'stay');

T::ok((int) $january['direct']['tax'] > 0, 'January has direct tax inside its booking totals');
T::same(
    (int) $january['direct']['due'] - (int) $january['direct']['tax'],
    (int) $january['direct']['room_revenue'],
    'And its room revenue is the totals less that tax, to the cent'
);
T::ok(
    (int) $january['direct']['room_revenue'] < (int) $january['direct']['due'],
    'Which is below what the guests were billed'
);
T::same(0, (int) $january['direct']['tax_unknown_money'], 'Nothing in January has an unknown tax');

T::group('A booking with no breakdown has an unknown tax, never a tax of zero');

// Take the breakdown away from one booking — the shape of the 147 live
// bookings that have none — and the ledger must stop counting its total as
// room revenue rather than counting its tax as nothing.
global $wpdb;
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s",
        7983,
        '_mphb_booking_price_breakdown'
    )
);
Snapshot::run(false, 1);
Reports::flush_cache();

$after = Reports::summary('2025-01-01', '2025-01-31', 'stay');

T::ok((int) $after['direct']['tax_unknown_bookings'] > 0, 'The booking is named as one whose tax is unknown');
T::ok((int) $after['direct']['tax_unknown_money'] > 0, 'With its money named beside it');
T::ok((int) $after['direct']['tax_unknown_nights'] > 0, 'And its nights');
T::ok(
    (int) $after['direct']['room_revenue'] < (int) $january['direct']['room_revenue'],
    'Its total is no longer counted as room revenue'
);
T::same(
    (int) $january['direct']['due'],
    (int) $after['direct']['due'],
    'But the money is still reported: an unknown tax hides nothing'
);
T::ok(
    (int) $after['totals']['rate_nights'] < (int) $january['totals']['rate_nights'],
    'And its nights come out of the rate, because a rate it cannot divide is not a rate'
);
T::ok(
    isset($after['direct']['tax_reasons']['no breakdown']),
    'The screen is told why: there is no breakdown to read'
);

foreach (Audit::run('2025-01-01', '2025-12-31') as $check) {
    T::ok($check['ok'], 'With an unknown tax in it: ' . $check['what'] . ' — ' . $check['detail']);
}

T::group('Booking.com\'s gross is its Final amount, even before the payout arrives');

// A Booking.com reservation row states its Final amount as room sales; its
// payout file states the same money again as a guest total. Reading the
// guest total alone reported $0 of gross for every Booking.com stay whose
// payout had not arrived, while its nights went on dividing the rate.
$november = Reports::summary('2025-11-01', '2025-11-30', 'stay');
$bcom_nov = $november['by_channel']['bookingcom'] ?? [];

T::ok((int) ($bcom_nov['nights'] ?? 0) > 0, 'November has Booking.com nights');
T::same(0, (int) ($bcom_nov['guest_total'] ?? 0), 'With no payout yet, so no guest total');
T::ok((int) ($bcom_nov['room_sales'] ?? 0) > 0, 'But a Final amount from the reservations file');
T::same(
    (int) ($bcom_nov['room_sales'] ?? 0),
    (int) ($bcom_nov['room_revenue'] ?? 0),
    'And its gross room revenue is that Final amount, not $0'
);
T::same(
    (int) ($bcom_nov['room_sales'] ?? 0) - (int) ($bcom_nov['commission'] ?? 0),
    (int) ($bcom_nov['room_revenue_net'] ?? 0),
    'Net is that less the commission, so it is not a negative figure'
);

// March 2025 has both: a reservation row AND a payout. The money must be
// counted once, not twice.
$march_bcom = Reports::summary('2025-03-01', '2025-03-31', 'stay')['by_channel']['bookingcom'] ?? [];
T::ok((int) ($march_bcom['guest_total'] ?? 0) > 0, 'March has a Booking.com payout behind it');
T::same(
    (int) ($march_bcom['guest_total'] ?? 0)
        - (int) ($march_bcom['tax_in_payout'] ?? 0)
        - (int) ($march_bcom['tax_platform_remitted'] ?? 0)
        + (int) ($march_bcom['refund'] ?? 0),
    (int) ($march_bcom['room_revenue'] ?? 0),
    'And where both are stated the guest total wins: the money is counted once'
);

T::group('A direct stay crossing two month ends still ties to the cent');

// Three periods is where rounding each share on its own breaks: two
// periods always tie by accident, because the halves of a stay round in
// opposite directions. Thirty nights over January, February and March of
// $100.00 come to $99.99 if each month is rounded without regard to where
// in the stay it begins.
$wpdb->insert($wpdb->posts, [
    'ID' => 9077, 'post_parent' => 0, 'post_type' => 'mphb_booking',
    'post_status' => 'confirmed', 'post_title' => 'Booking #9077',
    'post_date' => '2026-01-02 10:00:00',
]);
$wpdb->insert($wpdb->posts, [
    'ID' => 90770, 'post_parent' => 9077, 'post_type' => 'mphb_reserved_room',
    'post_status' => 'publish', 'post_title' => 'Reserved room',
    'post_date' => '2026-01-02 10:00:00',
]);
foreach ([
    [90770, '_mphb_room_id', '1066'],
    [9077, 'mphb_check_in_date', '2026-01-31'],
    [9077, 'mphb_check_out_date', '2026-03-02'],
    [9077, 'mphb_total_price', '100.00'],
    [9077, '_mphb_booking_price_breakdown', dccl_price_breakdown('100.00', 1066)],
] as [$post, $key, $value]) {
    $wpdb->insert($wpdb->postmeta, ['post_id' => $post, 'meta_key' => $key, 'meta_value' => $value]);
}
Snapshot::run(false, 1);
Reports::flush_cache();

$quarter = Reports::summary('2026-01-01', '2026-03-31', 'stay');
$by_month = 0;
foreach ([['2026-01-01', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-31']] as [$a, $b]) {
    $by_month += (int) Reports::summary($a, $b, 'stay')['direct']['room_revenue'];
}
T::ok((int) $quarter['direct']['room_revenue'] > 0, 'The quarter has direct room revenue in it');
T::same(
    (int) $quarter['direct']['room_revenue'],
    $by_month,
    'January, February and March come to the quarter, to the cent'
);

T::group('A tax reading is versioned, never overwritten');

$first = DCCL\Taxes::current(9077);
T::ok($first !== null, 'The snapshot froze a reading for the new booking');
T::same(1, (int) $first['version'], 'As version 1');
T::ok((int) $first['tax_cents'] > 0, 'With the tax it read out of the breakdown');

// MotoPress is re-priced: a new reading, beside the old one, never over it.
$wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s", 9077, 'mphb_total_price'));
$wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s", 9077, '_mphb_booking_price_breakdown'));
$wpdb->insert($wpdb->postmeta, ['post_id' => 9077, 'meta_key' => 'mphb_total_price', 'meta_value' => '120.00']);
$wpdb->insert($wpdb->postmeta, ['post_id' => 9077, 'meta_key' => '_mphb_booking_price_breakdown', 'meta_value' => dccl_price_breakdown('120.00', 1066)]);
Snapshot::run(false, 1);
Reports::flush_cache();

$second = DCCL\Taxes::current(9077);
T::same(2, (int) $second['version'], 'The re-priced booking gets a second version');
T::ok((int) $second['tax_cents'] > (int) $first['tax_cents'], 'Reading the larger tax inside the larger total');

$rows = $wpdb->get_results(
    $wpdb->prepare("SELECT version, is_current FROM " . Schema::booking_taxes() . " WHERE mphb_booking_id = %d ORDER BY version", 9077),
    ARRAY_A
);
T::same(2, count($rows), 'Both readings are still there');
T::same(0, (int) $rows[0]['is_current'], 'The first is no longer current');
T::same(1, (int) $rows[1]['is_current'], 'And the second is');
