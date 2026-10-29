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

$thirds = Money::allocate(10000, [1, 1, 1]);
T::same(10000, array_sum($thirds), '$100 split three ways still adds to $100');
T::same([3333, 3333, 3334], $thirds, 'And the leftover cent lands on the last part');

$nights = Money::allocate(100, [3, 4]);
T::same(100, array_sum($nights), 'A dollar split by nights adds to a dollar');

$negative = Money::allocate(-10000, [3, 4]);
T::same(-10000, array_sum($negative), 'A refund splits exactly too');

T::same(3333, Money::share(10000, 1, 3), 'One third of $100, rounded half up');
T::same(0, Money::share(10000, 1, 0), 'Nothing is divided by nothing');

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

