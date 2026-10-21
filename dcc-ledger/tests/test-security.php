<?php
/** Capability and nonce checks on every screen and every action. */

declare(strict_types=1);

use DCCL\Admin;
use DCCL\Settings;

T::group('Capability checks');

$denied = static function (callable $fn, string $what): void {
    $GLOBALS['dccl_caps']['manage_options'] = false;
    try {
        $fn();
        T::ok(false, $what);
    } catch (RuntimeException $e) {
        T::ok(str_contains($e->getMessage(), 'wp_die'), $what);
    } finally {
        $GLOBALS['dccl_caps']['manage_options'] = true;
    }
};

$_REQUEST['_wpnonce'] = 'test';
$_POST = ['_wpnonce' => 'test'];

$denied(static fn () => Admin::render(), 'The ledger screen refuses a user without manage_options');
// Walked from Admin::ACTIONS, so a new action cannot be added without its
// capability check: the list is the plugin's own, not a copy of it.
foreach (Admin::ACTIONS as $action) {
    $denied(
        static fn () => Admin::{'handle_' . $action}(),
        'dccl_' . $action . ' refuses a user without manage_options'
    );
}

T::group('Nonce checks');

$no_nonce = static function (callable $fn, string $what): void {
    $_REQUEST['_wpnonce'] = 'wrong';
    try {
        $fn();
        T::ok(false, $what);
    } catch (RuntimeException $e) {
        T::ok(str_contains($e->getMessage(), 'nonce check failed'), $what);
    } finally {
        $_REQUEST['_wpnonce'] = 'test';
    }
};

foreach (Admin::ACTIONS as $action) {
    $no_nonce(
        static fn () => Admin::{'handle_' . $action}(),
        'dccl_' . $action . ' refuses a bad nonce'
    );
}

T::group('Every admin action is registered behind a handler');

foreach (Admin::ACTIONS as $action) {
    T::ok(method_exists(Admin::class, 'handle_' . $action), 'dccl_' . $action . ' has a handler');
}

T::group('No REST routes and no front-end output');

$source = dccl_plugin_source();
T::ok(!str_contains($source, 'register_rest_route'), 'The plugin registers no REST routes');
T::ok(!str_contains($source, 'wp_ajax_nopriv'), 'The plugin exposes no logged-out AJAX endpoint');
T::ok(!str_contains($source, 'add_shortcode'), 'The plugin registers no shortcode');
T::ok(!str_contains($source, 'wp_enqueue_scripts'), 'The plugin enqueues nothing on the front end');

T::group('Settings cannot be made to point at a cottage that does not exist');

Settings::save_maps(['bookingcom' => ['14033916' => '22', '99999999' => '99', 'bad id!' => '23']]);
$map = DCCL\Cottages::bookingcom_map();
T::same('22', $map['14033916'] ?? '', 'A valid mapping is saved');
T::ok(!isset($map['99999999']), 'A cottage that does not exist is dropped');
T::ok(isset($map['badid']) || !isset($map['bad id!']), 'An id with stray characters is cleaned before saving');

T::group('Nothing autoloads');

// The bootstrap throws if update_option() is ever called with autoload on.
Settings::set_delete_data_on_uninstall(true);
DCCL\Reports::flush_cache();
T::ok(true, 'No option is written with autoload enabled');

T::group('Table creation only happens on activation or upgrade');

$GLOBALS['dccl_options'][DCCL\Schema::VERSION_OPTION] = DCCL\Schema::DB_VERSION;
global $wpdb;
$wpdb->writes = [];
DCCL\Schema::maybe_upgrade();
$created = array_filter($wpdb->writes, static fn ($sql) => str_contains(strtoupper($sql), 'CREATE TABLE'));
T::same([], $created, 'With the DB version current, nothing is created');
