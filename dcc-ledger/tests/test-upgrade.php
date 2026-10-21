<?php
/**
 * Upgrading an installation that already has tables.
 *
 * 0.1.3 shipped a schema whose stays table never gained its new column on an
 * upgrade, while a fresh install was perfect — the difference being an SQL
 * comment inside the CREATE TABLE, which dbDelta reads as a column. Nothing
 * here had ever run an upgrade, so nothing could have caught it.
 */

declare(strict_types=1);

use DCCL\Health;
use DCCL\Schema;

global $wpdb;

T::group('Every table keeps every column it is defined with');

Schema::install();

foreach (Schema::expected_columns() as $name => $columns) {
    $table = Schema::table($name);
    $have  = [];
    foreach ($wpdb->get_results("SHOW COLUMNS FROM {$table}", ARRAY_A) as $row) {
        $have[] = (string) $row['Field'];
    }
    foreach ($columns as $column) {
        T::ok(in_array($column, $have, true), $name . ' has ' . $column);
    }
}

T::group('Upgrading from the 0.1.2 schema adds what 0.1.3 and 0.1.4 need');

// The tables as 0.1.2 left them: no guest_keys anywhere.
$wpdb = new Test_WPDB();
$GLOBALS['dccl_options'] = [];

foreach (Schema::table_names() as $name) {
    $definition = Schema::definitions()[$name];
    $columns    = [];
    foreach ($definition['columns'] as $column => $type) {
        if ($column === 'guest_keys') {
            continue; // 0.1.2 had no such column
        }
        $columns[] = translate_column($column . ' ' . $type);
    }
    $wpdb->exec_raw(sprintf('CREATE TABLE %s (%s)', Schema::table($name), implode(', ', $columns)));
}

T::ok(!in_array('guest_keys', table_columns(Schema::stays()), true), 'The old stays table has no guest_keys');
T::ok(!in_array('guest_keys', table_columns(Schema::originals()), true), 'Nor does the old originals table');

Schema::install();

T::ok(in_array('guest_keys', table_columns(Schema::stays()), true), 'The upgrade adds guest_keys to stays');
T::ok(in_array('guest_keys', table_columns(Schema::originals()), true), 'And to originals');

foreach (Schema::expected_columns() as $name => $columns) {
    $have = table_columns(Schema::table($name));
    $gap  = array_values(array_diff($columns, $have));
    T::same([], $gap, 'After upgrading, ' . $name . ' has every column it is defined with');
}

T::same(Schema::DB_VERSION, get_option(Schema::VERSION_OPTION), 'And the stored version is current');

T::group('A missing column is reported, not left to read as zero');

T::same([], Health::missing_columns(), 'With the upgrade done, nothing is missing');

$wpdb->exec_raw('CREATE TABLE tmp_stays AS SELECT * FROM ' . Schema::stays());
$wpdb->exec_raw('DROP TABLE ' . Schema::stays());
$columns = [];
foreach (Schema::definitions()['stays']['columns'] as $column => $type) {
    if ($column === 'guest_keys') {
        continue;
    }
    $columns[] = translate_column($column . ' ' . $type);
}
$wpdb->exec_raw(sprintf('CREATE TABLE %s (%s)', Schema::stays(), implode(', ', $columns)));

$missing = Health::missing_columns();
T::same(1, count($missing), 'A column removed behind the plugin\'s back is noticed');
T::same('stays', $missing[0]['table'] ?? '', 'The table is named');
T::same('guest_keys', $missing[0]['column'] ?? '', 'And so is the column');

$check = Health::check();
T::ok(!$check['ok'], 'The health check fails');
T::ok(str_contains(Health::banner(), 'stays.guest_keys'), 'And the banner names it, in place of figures');

T::group('No CREATE TABLE statement carries an SQL comment');

// The direct guard: dbDelta reads these line by line, and a comment line is
// taken for a column definition.
foreach (Schema::table_names() as $name) {
    $statement = Schema::create_statement($name);
    T::ok(!str_contains($statement, '--'), $name . ' has no -- comment in its SQL');
    T::ok(!str_contains($statement, '#'), $name . ' has no # comment in its SQL');
    T::ok(!str_contains($statement, '/*'), $name . ' has no block comment in its SQL');
}
