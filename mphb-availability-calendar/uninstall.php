<?php
/**
 * Uninstall hook for MPHB Availability Calendar.
 * Removes all plugin-owned transients from the options table.
 *
 * Multisite safe: on a network uninstall, the SQL would otherwise only touch
 * the current site's options table and leave subsite transients orphaned.
 * We loop every site and delete per-site.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;

$delete_for_current_site = static function () use ($wpdb): void {
    $like = $wpdb->esc_like('_transient_mphbac_') . '%';
    $like_timeout = $wpdb->esc_like('_transient_timeout_mphbac_') . '%';
    $wpdb->query(
        $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
            $like,
            $like_timeout
        )
    );
    delete_option('mphbac_cache_gen');
};

if (function_exists('is_multisite') && is_multisite()) {
    $site_ids = get_sites(['fields' => 'ids', 'number' => 0]);
    foreach ($site_ids as $site_id) {
        switch_to_blog((int) $site_id);
        $delete_for_current_site();
        restore_current_blog();
    }
} else {
    $delete_for_current_site();
}
