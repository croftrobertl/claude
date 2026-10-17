<?php
/**
 * Uninstall hook for MPHB Availability Calendar.
 * Removes all plugin-owned transients and cache rows from the options table.
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
    // The cache's own rows since 0.47.4 (Cache: mphbac_c_<hash>, plain
    // options that carry their own expiry). Uninstall is the one place a
    // range delete belongs — nobody is reading the calendar any more.
    $like_rows = $wpdb->esc_like('mphbac_c_') . '%';
    $wpdb->query(
        $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s OR option_name LIKE %s",
            $like,
            $like_timeout,
            $like_rows
        )
    );
    delete_option('mphbac_cache_gen');
    delete_option('mphbac_rules_gen');           // 0.47.4: the booking rules' own generation
    delete_option('mphbac_rules_failed_logged');   // 0.47.4: when a rules failure was last logged
    // The settings row and its schema version (0.40.0). UNINSTALL, not
    // deactivate: deactivating leaves them alone, so switching the plugin off
    // and on again keeps everything the admin chose. Deleting the plugin is
    // the explicit "remove it and its data" action, and leaving an orphaned
    // option behind is the thing this file exists to prevent.
    delete_option('mphbac_settings');
    delete_option('mphbac_settings_version');
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
