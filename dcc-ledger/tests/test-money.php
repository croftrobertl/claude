<?php
/**
 * Money as whole cents, and the migration that got it there.
 *
 * The ledger held two years of Rob's history as decimals when 0.2.0 changed
 * them to cents, so the conversion is tested the way it was run: back up,
 * convert, prove every total ties before and after, and be able to put it
 * all back.
 */

declare(strict_types=1);

use DCCL\Health;
use DCCL\Money;
use DCCL\Money_Migration;
use DCCL\Schema;

global $wpdb;

T::group('Reading an amount off a source document');

// (int) (19.99 * 100) is 1998. Every one of these would be a cent out if the
// cell were multiplied as a float instead of read as text.
T::same(1999, Money::to_cents('19.99'), '19.99 is 1999 cents, not 1998');
T::same(10, Money::to_cents('0.1'), 'A tenth is 10 cents');
T::same(123456, Money::to_cents('1,234.56'), 'Thousands separators are read');
T::same(123456, Money::to_cents('$1,234.56'), 'And so is a currency symbol');
T::same(-1234, Money::to_cents('(12.34)'), 'Accounting brackets mean negative');
T::same(-505, Money::to_cents('-5.05'), 'So does a leading minus');
T::same(700, Money::to_cents('7'), 'A bare integer is dollars');
T::same(0, Money::to_cents(''), 'An empty cell is nothing, not a guess');
T::same(1, Money::to_cents('0.005'), 'A half cent rounds away from zero');
T::same(-1, Money::to_cents('-0.005'), 'In both directions');
T::same(0, Money::to_cents('0.004'), 'And below half it does not');

T::group('Printing an amount for a person');

T::same('-12.34', Money::to_decimal(-1234), 'A decimal for the mirror column');
T::same('0.07', Money::to_decimal(7), 'Including the leading zero');
T::same('$1,234.56', Money::format(123456), 'Formatted with its separators');

T::group('Splitting an amount so the parts sum to the whole');

// Every period of a stay reads the same running total, so consecutive
// periods cancel each other's rounding and any partition ties exactly.
$thirds = [
    Money::slice(10000, 0, 1, 3),
    Money::slice(10000, 1, 1, 3),
    Money::slice(10000, 2, 1, 3),
];
T::same(10000, array_sum($thirds), '$100 split three ways still adds to $100');
// The leftover cent lands where the running total crosses, not on a part
// chosen in advance: $33.33, $33.34, $33.33.
T::same([3333, 3334, 3333], $thirds, 'And no part is more than a cent from its share');

T::same(100, Money::slice(100, 0, 3, 7) + Money::slice(100, 3, 4, 7), 'A dollar split by nights adds to a dollar');
T::same(-10000, Money::slice(-10000, 0, 3, 7) + Money::slice(-10000, 3, 4, 7), 'A refund splits exactly too');

T::same(10000, Money::slice(10000, 0, 7, 7), 'A whole range is the whole amount, never rounded');
T::same(0, Money::slice(10000, 0, 0, 7), 'No nights in the period, no money from it');
T::same(0, Money::slice(10000, 1, 1, 0), 'Nothing is divided by nothing');
T::same(3333, Money::slice(10000, 0, 1, 3), 'One third of $100, rounded half up');

// The defect of 0.3.2: rounding each month on its own. Across every stay
// length and every split point, the parts must come to the whole.
$exact = true;
for ($total = 1; $total <= 14; $total++) {
    for ($cut = 0; $cut <= $total; $cut++) {
        foreach ([1, 7, 99, 12345, 549_17, -860_25] as $cents) {
            $a = Money::slice($cents, 0, $cut, $total);
            $b = Money::slice($cents, $cut, $total - $cut, $total);
            if ($a + $b !== $cents) {
                $exact = false;
            }
        }
    }
}
T::ok($exact, 'Every two-way split of every stay length ties to the cent');

// Three periods, the shape a stay crossing two month ends actually takes.
$ties = true;
for ($total = 3; $total <= 31; $total++) {
    for ($a = 1; $a < $total - 1; $a++) {
        for ($b = $a + 1; $b < $total; $b++) {
            $sum = Money::slice(999_99, 0, $a, $total)
                + Money::slice(999_99, $a, $b - $a, $total)
                + Money::slice(999_99, $b, $total - $b, $total);
            if ($sum !== 999_99) {
                $ties = false;
            }
        }
    }
}
T::ok($ties, 'And every three-way split does too');

// A stay whose stated nights disagree with its dates cannot take more than
// it has: the clamp keeps a period from reaching past the end of the stay.
T::same(10000, Money::slice(10000, 0, 99, 5), 'A period longer than the stay takes the stay, no more');
T::same(0, Money::slice(10000, 9, 3, 5), 'A period starting past the end takes nothing');

T::group('Upgrading a ledger that holds decimals');

// The tables as 0.1.9 left them: the money columns, no cents beside them.
$wpdb = new Test_WPDB();
$GLOBALS['dccl_options'] = [];

foreach (Schema::table_names() as $name) {
    $definition = Schema::definitions()[$name];
    $columns    = [];
    foreach ($definition['columns'] as $column => $type) {
        if (str_ends_with($column, '_cents')) {
            continue; // 0.1.9 had no such column
        }
        $columns[] = translate_column($column . ' ' . $type);
    }
    $wpdb->exec_raw(sprintf('CREATE TABLE %s (%s)', Schema::table($name), implode(', ', $columns)));
}

T::ok(!in_array('amount_cents', table_columns(Schema::lines()), true), 'The old lines table has no cents column');

// Amounts chosen because each is wrong by a cent if read as a float.
$wpdb->insert(Schema::lines(), [
    'channel' => 'airbnb', 'type' => 'payout', 'amount' => '19.99',
    'event_date' => '2025-03-05', 'hash' => 'h1', 'created_at' => '2025-03-05 00:00:00',
]);
$wpdb->insert(Schema::lines(), [
    'channel' => 'airbnb', 'type' => 'guest_total', 'amount' => '1.10',
    'event_date' => '2025-03-05', 'hash' => 'h2', 'created_at' => '2025-03-05 00:00:00',
]);
$wpdb->insert(Schema::lines(), [
    'channel' => 'bookingcom', 'type' => 'refund', 'amount' => '-292.16',
    'event_date' => '2025-12-20', 'hash' => 'h3', 'created_at' => '2025-12-20 00:00:00',
]);
$wpdb->insert(Schema::adjustments(), [
    'type' => 'assumed_paid', 'channel' => 'direct', 'mphb_booking_id' => 9008,
    'amount' => '350.00', 'event_date' => '2025-05-01', 'label' => 'Assumed Paid In Full',
    'hash' => 'a1', 'created_at' => '2026-10-18 00:00:00',
]);
$wpdb->insert(Schema::originals(), [
    'kind' => 'booking', 'mphb_id' => 9008, 'version' => 1, 'is_current' => 1,
    'channel' => 'direct', 'cottage' => '32', 'check_in' => '2025-05-01',
    'booking_status' => 'confirmed', 'total' => '600.00',
    'content_hash' => 'c1', 'captured_at' => '2026-10-18 00:00:00',
]);

$before = Money_Migration::totals();

Schema::install();
T::ok(in_array('amount_cents', table_columns(Schema::lines()), true), 'The upgrade adds the cents column');

$result = Money_Migration::run();

T::ok($result['ok'], 'The conversion reports success');
T::ok(Money_Migration::done(), 'And the ledger is reading cents');

foreach ($result['checks'] as $check) {
    T::ok($check['ok'], 'Totals tie for ' . $check['what'] . ': ' . $check['detail']);
}

T::same(
    1999,
    (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h1'"),
    '19.99 converted to 1999 cents, not 1998'
);
T::same(
    110,
    (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h2'"),
    'And 1.10 to 110'
);
T::same(
    -29216,
    (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h3'"),
    'A refund keeps its sign'
);
T::same(
    60000,
    (int) $wpdb->get_var("SELECT total_cents FROM " . Schema::originals() . " WHERE content_hash = 'c1'"),
    'An Original booking total converts too'
);
T::same(0, Health::money_not_in_cents(), 'Nothing is left holding a decimal and no cents');

T::group('The old values are kept, not overwritten');

T::same(
    '19.99',
    (string) $wpdb->get_var(
        "SELECT old_value FROM " . Schema::money_backup() .
        " WHERE table_name = 'lines' AND column_name = 'amount' AND row_id = 1"
    ),
    'Every converted cell is backed up as it stood'
);
// Five money cells hold something; the sixth is the Original's payment
// amount, which a booking row does not have. It is backed up as NULL so the
// rollback can put the emptiness back too.
T::same(
    6,
    (int) $wpdb->get_var("SELECT COUNT(*) FROM " . Schema::money_backup()),
    'One backup row per money cell, filled or not'
);

$again = Money_Migration::run();
T::ok($again['ok'], 'Running it a second time is harmless');
T::same(
    6,
    (int) $wpdb->get_var("SELECT COUNT(*) FROM " . Schema::money_backup()),
    'And cannot bury the original values under its own output'
);

T::group('Rolling the conversion back');

$rolled = Money_Migration::rollback();

T::same(6, $rolled['restored'], 'Every cell is put back');
T::ok(!Money_Migration::done(), 'The ledger is no longer reading cents');
T::same(
    '19.99',
    (string) $wpdb->get_var("SELECT amount FROM " . Schema::lines() . " WHERE hash = 'h1'"),
    'The decimal is exactly what it was'
);
T::same(
    0,
    (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h1'"),
    'And the cents column is empty again'
);
// "Exactly as they were" includes the cells that held nothing. A booking
// Original has no payment amount; it must come back empty, not as an empty
// string standing where a NULL was.
T::same(
    null,
    $wpdb->get_var("SELECT amount FROM " . Schema::originals() . " WHERE content_hash = 'c1'"),
    'A cell that held nothing is restored as nothing, not as an empty string'
);
T::ok(
    Health::money_not_in_cents() > 0,
    'A rolled-back ledger says so loudly rather than reporting zeroes'
);
$check = Health::check();
T::ok(!$check['ok'], 'The health check fails while it is in that state');
T::ok(str_contains(Health::banner(), 'not in cents'), 'And the banner says why, in place of figures');

T::group('Converting again after a rollback');

$redo = Money_Migration::run();
T::ok($redo['ok'], 'It converts cleanly a second time');
T::same(0, Health::money_not_in_cents(), 'And the banner clears');


T::group('The tax inside a MotoPress booking total');

// The real shape, counted on live on 2026-10-30: a JSON string, not a
// serialized PHP array. 0.3.3 read it as serialized, found nothing, and
// put all 267 direct bookings into "tax unknown".
$json = dccl_price_breakdown('500.00', 1066);
T::ok($json[0] === '{', 'The fixture is JSON, the way live stores it');

$read = \DCCL\Breakdown::read($json, 50000);
T::ok($read['known'], 'A JSON breakdown whose total matches the booking is read');
T::same(4955, (int) $read['tax_cents'], 'And its room tax comes out in whole cents');
T::ok($read['has_tax'], 'It is counted among the bookings that list a room tax');

// 41 of the 117 the Director sampled list no room tax at all. That is a
// tax of zero that is KNOWN to be zero — not an unknown.
$read = \DCCL\Breakdown::read(dccl_price_breakdown('500.00', 1066, false), 50000);
T::ok($read['known'], 'A breakdown that lists no room tax is still read');
T::same(0, (int) $read['tax_cents'], 'Its tax is nothing');
T::ok(!$read['has_tax'], 'And it is counted apart from the ones that list one');

// Tax on services and on fees comes out too, where either is non-zero.
$with_extras = json_encode([
    'total' => '600.00',
    'rooms' => [[
        'room'     => ['total' => '450.45'],
        'services' => ['total' => '50.00'],
        'fees'     => ['total' => '25.00'],
        'taxes'    => [
            'room'     => ['total' => '49.55', 'list' => [['label' => 'Accommodation tax', 'price' => '49.55']]],
            'services' => ['total' => '15.00'],
            'fees'     => ['total' => '10.00'],
        ],
        'total' => '600.00',
    ]],
]);
$read = \DCCL\Breakdown::read($with_extras, 60000);
T::ok($read['known'], 'A breakdown with service and fee tax is read');
T::same(7455, (int) $read['tax_cents'], 'All three tax buckets are taken out of the total');

// Two rooms on one booking: both rooms' taxes count.
$two_rooms = json_encode([
    'total' => '1000.00',
    'rooms' => [
        ['room' => ['total' => '450.45'], 'taxes' => ['room' => ['total' => '49.55']], 'total' => '500.00'],
        ['room' => ['total' => '450.45'], 'taxes' => ['room' => ['total' => '49.55']], 'total' => '500.00'],
    ],
]);
T::same(9910, (int) \DCCL\Breakdown::read($two_rooms, 100000)['tax_cents'], 'Every room on the booking is counted');

// A bucket that states no total but lists its parts.
$listed = json_encode([
    'total' => '500.00',
    'rooms' => [['room' => ['total' => '450.45'], 'taxes' => ['room' => ['list' => [['label' => 'State', 'price' => '30.00'], ['label' => 'County', 'price' => '19.55']]]], 'total' => '500.00']],
]);
$read = \DCCL\Breakdown::read($listed, 50000);
T::ok($read['known'], 'A tax bucket that lists its parts instead of a total is read');
T::same(4955, (int) $read['tax_cents'], 'By adding the parts');

// The one of the 117 whose breakdown disagreed with the booking total.
$read = \DCCL\Breakdown::read($json, 60000);
T::ok(!$read['known'], 'A breakdown that disagrees with the booking total is not trusted');
T::same(0, (int) $read['tax_cents'], 'And states no tax rather than a wrong one');
T::same(\DCCL\Breakdown::TOTAL_DISAGREES, $read['reason'], 'Saying which way it failed');

// A tax bucket nobody has seen on this site. Reading it as nothing would
// overstate room revenue by its value, so the whole reading is refused.
$strange = json_encode([
    'total' => '500.00',
    'rooms' => [['room' => ['total' => '420.45'], 'taxes' => ['room' => ['total' => '49.55'], 'resort_levy' => ['total' => '30.00']], 'total' => '500.00']],
]);
$read = \DCCL\Breakdown::read($strange, 50000);
T::ok(!$read['known'], 'A tax bucket this reader does not know refuses the whole reading');
T::same(\DCCL\Breakdown::UNKNOWN_BUCKET, $read['reason'], 'And says so, rather than reading the tax short');

T::same(\DCCL\Breakdown::NO_BREAKDOWN, \DCCL\Breakdown::read('', 50000)['reason'], 'No breakdown is named as none');
T::same(\DCCL\Breakdown::UNREADABLE, \DCCL\Breakdown::read('not json at all', 50000)['reason'], 'And so is one that will not decode');
T::same(\DCCL\Breakdown::UNREADABLE, \DCCL\Breakdown::read('{"total": broken', 50000)['reason'], 'And so is JSON that will not parse');
T::same(\DCCL\Breakdown::NO_TOTAL, \DCCL\Breakdown::read('{"rooms": []}', 50000)['reason'], 'And one that states no total');
T::same(\DCCL\Breakdown::NO_ROOMS, \DCCL\Breakdown::read('{"total": "500.00"}', 50000)['reason'], 'And one that lists no rooms');

// A serialized PHP array is still read, for a site that stores one.
$serialized = serialize(['total' => '500.00', 'rooms' => [['taxes' => ['room' => ['total' => '49.55']]]]]);
T::same(4955, (int) \DCCL\Breakdown::read($serialized, 50000)['tax_cents'], 'A serialized array is still read');

// Stored data must never become an object. This payload is a complete,
// readable breakdown in every respect but one: it is an object. Cast to an
// array it would be accepted and its tax read, so refusing it has to
// happen at the decode, not by falling over further in.
$object = \DCCL\Breakdown::read(
    'O:8:"stdClass":2:{s:5:"total";s:6:"500.00";s:5:"rooms";a:1:{i:0;a:1:{s:5:"taxes";a:1:{s:4:"room";a:1:{s:5:"total";s:5:"49.55";}}}}}',
    50000
);
T::ok(!$object['known'], 'A serialized object in the meta is refused, not instantiated');
T::same(\DCCL\Breakdown::UNREADABLE, $object['reason'], 'Refused at the decode, before anything in it is read');
T::same(0, (int) $object['tax_cents'], 'And nothing is read out of it');
