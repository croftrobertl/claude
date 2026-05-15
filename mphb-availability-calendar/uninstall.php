<?php
/**
 * Uninstall hook for MPHB Availability Calendar.
 * Removes all plugin-owned transients from the options table.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;

$like = $wpdb->esc_like('_transient_mphbac_') . '%';
$like_timeout = $wpdb->esc_like('_transient_timeout_mphbac_') . '%';
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $like,
        $like_timeout
    )
);
