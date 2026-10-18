<?php
/**
 * Uninstall.
 *
 * By default this removes nothing: the ledger is years of money history, and
 * deleting the plugin is not the same as deciding to throw that away. The
 * tables and their rows only go when the admin ticked "Delete all ledger data"
 * on the settings page first.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

require_once __DIR__ . '/includes/autoload.php';

if (!defined('DCCL_DIR')) {
    define('DCCL_DIR', plugin_dir_path(__FILE__));
}

if (!get_option('dccl_delete_data_on_uninstall', false)) {
    return;
}

\DCCL\Schema::drop_all();

delete_option('dccl_channel_maps');
delete_option('dccl_report_cache');
delete_option('dccl_delete_data_on_uninstall');
