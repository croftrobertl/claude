<?php
/**
 * Uninstall: remove everything the plugin persisted.
 *
 * v0.12.0: this file used to state that nothing was stored, which stopped
 * being true when the settings page arrived — the Gemini API key in
 * particular was surviving removal. Runs only on true uninstall (Delete on
 * the Plugins screen), never on deactivation, so a temporary deactivation
 * keeps the host's settings.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Options (settings + the cached public-guide source pointer).
foreach (['dccgg_gemini_key', 'dccgg_gemini_model', 'dccgg_guide_source_post'] as $option) {
    delete_option($option);
}

// Transients: caches (weather / NOAA / USGS / search index), rate-limit
// counters, and the discovery caches. All share the dccgg_ prefix, and each
// has a paired _transient_timeout_ row, so clear both patterns in one pass.
global $wpdb;
$like = $wpdb->esc_like('_transient_dccgg_') . '%';
$like_timeout = $wpdb->esc_like('_transient_timeout_dccgg_') . '%';
$wpdb->query($wpdb->prepare( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
    $like,
    $like_timeout
));
