<?php
// Uninstall cleanup for MPHB Schema Manager.

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('mphbsch_schema_defaults');
delete_option('mphbsch_schema_cottage_defaults');

// Remove cached transients (prefix mphbsch_).
global $wpdb;
$like  = $wpdb->esc_like('_transient_mphbsch_') . '%';
$tmout = $wpdb->esc_like('_transient_timeout_mphbsch_') . '%';
$wpdb->query($wpdb->prepare(
    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
    $like,
    $tmout
));
