<?php
/** No names stored, no MotoPress writes, no uploaded file left behind. */

declare(strict_types=1);

use DCCL\Admin;
use DCCL\Importer;
use DCCL\Issues;
use DCCL\Linker;
use DCCL\Reports;
use DCCL\Schema;

global $wpdb;

T::group('No guest details are persisted');

$files = [
    'airbnb-payout.csv', 'airbnb-reservations.csv',
    'bookingcom-reservations.csv', 'bookingcom-payout.csv',
    'vrbo-reservations.csv', 'vrbo-payout.csv', 'bookingcom-invoices.csv',
];
dccl_full_setup();

$dump = '';
foreach (['stays', 'lines', 'links', 'batches', 'reviews', 'originals', 'adjustments'] as $name) {
    foreach ($wpdb->get_results('SELECT * FROM ' . Schema::table($name), ARRAY_A) as $row) {
        $dump .= (string) json_encode($row);
    }
}

foreach (dccl_fixture_pii() as $needle) {
    T::ok(!dccl_has_pii($dump, $needle), 'No "' . $needle . '" anywhere in the ledger tables');
}

T::ok(str_contains($dump, 'HMAAAA0001'), 'Confirmation codes are stored, because a stay is identified by one');
T::ok(str_contains($dump, '5111111111'), 'So are Booking.com reservation numbers');

T::group('The ledger never writes to MotoPress');

$wpdb->writes = [];
foreach ($files as $file) {
    Importer::run(dccl_fixture($file), $file, false, 1);
}
T::same([], $wpdb->mphb_writes(), 'An import writes nothing to posts or postmeta');

$wpdb->writes = [];
Linker::run(1);
T::same([], $wpdb->mphb_writes(), 'Linking writes nothing to posts or postmeta');

$wpdb->writes = [];
Reports::summary('2025-01-01', '2026-09-30', 'stay');
Reports::summary('2025-01-01', '2026-09-30', 'payout');
T::same([], $wpdb->mphb_writes(), 'Building the reports writes nothing to posts or postmeta');

$wpdb->writes = [];
Issues::all();
T::same([], $wpdb->mphb_writes(), 'Building the cleanup list writes nothing to posts or postmeta');

$wpdb->writes = [];
DCCL\Snapshot::run(false, 1);
T::same([], $wpdb->mphb_writes(), 'Taking a snapshot writes nothing to posts or postmeta');

$wpdb->writes = [];
DCCL\Batches::undo(1);
T::same([], $wpdb->mphb_writes(), 'Undo writes nothing to posts or postmeta');

T::group('No MotoPress write path exists in the source');

$source = dccl_plugin_source();
foreach ([
    'update_post_meta', 'add_post_meta', 'delete_post_meta',
    'wp_insert_post', 'wp_update_post', 'wp_delete_post', 'wp_trash_post',
] as $forbidden) {
    T::ok(!str_contains($source, $forbidden . '('), 'The plugin never calls ' . $forbidden . '()');
}

T::group('The uploaded file is deleted, on success and on failure');

$temp_pattern = sys_get_temp_dir() . '/dccl*';

$upload = static function (string $fixture): void {
    $source = dccl_fixture($fixture);
    $copy   = tempnam(sys_get_temp_dir(), 'upload');
    copy($source, $copy);

    $_REQUEST['_wpnonce'] = 'test';
    $_POST                = ['action' => 'dccl_import', 'dry_run' => '1', '_wpnonce' => 'test'];
    $_FILES               = [
        'ledger_file' => [
            'name'     => $fixture,
            'tmp_name' => $copy,
            'error'    => 0,
            'size'     => (int) filesize($copy),
        ],
    ];

    try {
        Admin::handle_import();
    } catch (RuntimeException $e) {
        // handle_import always ends in a redirect, which the stub throws.
    }

    if (file_exists($copy)) {
        @unlink($copy);
    }
};

$before = glob($temp_pattern) ?: [];
$upload('airbnb-payout.csv');
$after = glob($temp_pattern) ?: [];
T::same($before, $after, 'A successful import leaves no temp file behind');
T::ok(str_contains((string) ($GLOBALS['dccl_redirect'] ?? ''), 'Dry+run'), 'And it reports the dry run');

$before = glob($temp_pattern) ?: [];
$upload('not-a-ledger-file.csv');
$after = glob($temp_pattern) ?: [];
T::same($before, $after, 'A refused import leaves no temp file behind either');
T::ok(str_contains((string) ($GLOBALS['dccl_redirect'] ?? ''), 'dccl_type=error'), 'And it reports the refusal');

T::group('Nothing is stored in uploads');

T::ok(!str_contains($source, 'wp_upload_dir'), 'The plugin never asks for the uploads directory');
T::ok(!str_contains($source, 'wp_handle_upload'), 'And never hands a file to WordPress to keep');
