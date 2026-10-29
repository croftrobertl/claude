<?php
/**
 * Live goes from 0.1.9 straight to 0.3.0.
 *
 * It never ran 0.2.0, so the cents conversion, its proof and its rollback
 * all have to work from the 0.1.9 shape — decimals, no cents columns, no
 * backup table — in one activation. This builds that database and walks the
 * whole path over it.
 */

declare(strict_types=1);

use DCCL\Health;
use DCCL\Money;
use DCCL\Money_Migration;
use DCCL\Plugin;
use DCCL\Schema;

global $wpdb;

T::group('A database as 0.1.9 left it');

$wpdb = new Test_WPDB();
$GLOBALS['dccl_options'] = [];

// 0.1.9's schema: every table it had, none of 0.2.0's columns, and no
// money_backup table at all.
$tables_019 = array_filter(
    Schema::table_names(),
    static fn (string $name): bool => $name !== 'money_backup'
);

foreach ($tables_019 as $name) {
    $definition = Schema::definitions()[$name];
    $columns    = [];
    foreach ($definition['columns'] as $column => $type) {
        if (str_ends_with($column, '_cents')) {
            continue;
        }
        $columns[] = translate_column($column . ' ' . $type);
    }
    $wpdb->exec_raw(sprintf('CREATE TABLE %s (%s)', Schema::table($name), implode(', ', $columns)));
}
update_option(Schema::VERSION_OPTION, '4', false);

T::same('4', get_option(Schema::VERSION_OPTION), 'The stored schema version is 0.1.9\'s');
T::ok(!in_array('amount_cents', table_columns(Schema::lines()), true), 'The lines table has no cents column');
T::ok(!table_exists(Schema::money_backup()), 'And there is no backup table yet');

// Live's own shape, in miniature: money that is a cent out if read as a
// float, the three adjustment types, links and reviews a person made.
$money = [
    ['airbnb',     'payout',      '19.99',   '2025-03-05'],
    ['airbnb',     'guest_total', '1.10',    '2025-03-05'],
    ['bookingcom', 'room_sales',  '672.00',  '2025-03-05'],
    ['bookingcom', 'refund',      '-292.16', '2025-12-20'],
    ['vrbo',       'payout',      '1120.45', '2026-09-28'],
];
$n = 0;
foreach ($money as [$channel, $type, $amount, $date]) {
    $n++;
    $wpdb->insert(Schema::lines(), [
        'channel' => $channel, 'type' => $type, 'amount' => $amount,
        'event_date' => $date, 'hash' => 'h' . $n, 'created_at' => $date . ' 00:00:00',
    ]);
}

foreach ([
    ['assumed_paid', 9008, '350.00', '2025-05-01', 'Assumed Paid In Full'],
    ['assumed_paid_pre_exports', 1599, '640.00', '2024-11-04', 'Assumed Paid (Before The Exports)'],
    ['refund_not_recorded', 7983, '-216.45', '2025-01-24', 'Refund Not Recorded In MotoPress'],
] as $i => [$type, $booking, $amount, $date, $label]) {
    $wpdb->insert(Schema::adjustments(), [
        'type' => $type, 'channel' => 'direct', 'mphb_booking_id' => $booking,
        'amount' => $amount, 'event_date' => $date, 'label' => $label,
        'hash' => 'adj' . $i, 'created_at' => '2026-10-21 00:00:00',
    ]);
}

$wpdb->insert(Schema::originals(), [
    'kind' => 'booking', 'mphb_id' => 9008, 'version' => 1, 'is_current' => 1,
    'channel' => 'direct', 'cottage' => '32', 'check_in' => '2025-05-01',
    'booking_status' => 'confirmed', 'total' => '600.00',
    'content_hash' => 'orig1', 'captured_at' => '2026-10-18 00:00:00',
]);
$wpdb->insert(Schema::originals(), [
    'kind' => 'payment', 'mphb_id' => 90081, 'mphb_booking_id' => 9008, 'version' => 1,
    'is_current' => 1, 'channel' => 'direct', 'payment_status' => 'mphb-p-completed',
    'amount' => '250.00', 'event_date' => '2025-05-01',
    'content_hash' => 'orig2', 'captured_at' => '2026-10-18 00:00:00',
]);

$wpdb->insert(Schema::stays(), [
    'channel' => 'airbnb', 'code' => 'HM019AAA1', 'cottage' => '32',
    'check_in' => '2025-03-05', 'check_out' => '2025-03-08', 'nights' => 3,
    'status' => 'ok', 'created_at' => '2025-03-05 00:00:00', 'updated_at' => '2025-03-05 00:00:00',
]);
$stay_id = (int) $wpdb->insert_id;
$wpdb->insert(Schema::links(), [
    'stay_id' => $stay_id, 'mphb_booking_id' => 7278, 'method' => 'copy',
    'linked_at' => '2026-10-21 00:00:00', 'linked_by' => 1,
]);
$wpdb->insert(Schema::reviews(), [
    'issue_key' => 'overpaid:9009', 'note' => 'Checked Clover.',
    'reviewed_at' => '2026-10-21 00:00:00', 'reviewed_by' => 1,
]);

$links_before   = $wpdb->get_results('SELECT * FROM ' . Schema::links() . ' ORDER BY id', ARRAY_A);
$reviews_before = $wpdb->get_results('SELECT * FROM ' . Schema::reviews() . ' ORDER BY id', ARRAY_A);
$totals_before  = Money_Migration::totals();

T::group('One activation takes it to 0.3.0');

Plugin::instance()->maybe_upgrade();

T::same(Schema::DB_VERSION, get_option(Schema::VERSION_OPTION), 'The schema version is current');
T::ok(table_exists(Schema::money_backup()), 'The backup table was created on the way');

foreach (Schema::expected_columns() as $name => $columns) {
    $gap = array_values(array_diff($columns, table_columns(Schema::table($name))));
    T::same([], $gap, $name . ' has every column it is defined with');
}

T::group('The money converted, and proved itself, from 0.1.9');

T::ok(Money_Migration::done(), 'The ledger is reading cents');
T::same(0, Health::money_not_in_cents(), 'Nothing is left holding a decimal and no cents');
// The health check also wants MotoPress's own keys, and this suite seeds no
// MotoPress at all, so only its money half is asserted here.
T::same([], array_values(array_filter(
    Health::check()['missing'],
    static fn (array $m): bool => str_contains((string) $m['what'], 'cents')
)), 'The health check raises nothing about the money');

T::same(1999, (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h1'"), '19.99 is 1999 cents, not 1998');
T::same(110, (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h2'"), '1.10 is 110');
T::same(67200, (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h3'"), 'Room sales convert whole');
T::same(-29216, (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h4'"), 'And a refund keeps its sign');
T::same(112045, (int) $wpdb->get_var("SELECT amount_cents FROM " . Schema::lines() . " WHERE hash = 'h5'"), 'And a four-figure payout converts whole');

$checks = Money_Migration::verify($totals_before);
foreach ($checks as $check) {
    T::ok($check['ok'], 'Totals tie for ' . $check['what'] . ': ' . $check['detail']);
}

// Five line amounts, three adjustment amounts, and two columns on each of
// the two Originals: twelve cells, filled or not.
T::same(
    12,
    (int) $wpdb->get_var("SELECT COUNT(*) FROM " . Schema::money_backup()),
    'Every money cell was backed up before it was touched'
);

T::group('What a person decided is untouched by the upgrade');

T::same($links_before, $wpdb->get_results('SELECT * FROM ' . Schema::links() . ' ORDER BY id', ARRAY_A), 'Every link is exactly as it was');
T::same($reviews_before, $wpdb->get_results('SELECT * FROM ' . Schema::reviews() . ' ORDER BY id', ARRAY_A), 'And so is every review');

T::group('The rollback works from a 0.1.9 upgrade too');

$rolled = Money_Migration::rollback();
T::same(12, $rolled['restored'], 'Every cell is put back');
T::same('19.99', (string) $wpdb->get_var("SELECT amount FROM " . Schema::lines() . " WHERE hash = 'h1'"), 'The decimal is exactly what 0.1.9 held');
T::same(null, $wpdb->get_var("SELECT amount FROM " . Schema::originals() . " WHERE content_hash = 'orig1' AND kind = 'booking'") === null ? null : 'set', 'A cell 0.1.9 left empty is empty again');
T::ok(Health::money_not_in_cents() > 0, 'And the ledger says so rather than reporting zeroes');

$redo = Money_Migration::run();
T::ok($redo['ok'], 'Converting again from there works');
T::same(0, Health::money_not_in_cents(), 'With nothing left behind');
