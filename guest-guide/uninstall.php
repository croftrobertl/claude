<?php
/**
 * Uninstall hook for Guest Guide.
 *
 * The widget stores all of its content inside the Elementor element's own
 * settings, so it owns no standalone options. As a defensive, future-proof
 * cleanup (and to mirror the availability-calendar plugin's convention), remove
 * any transients that may have been created under the gguide_ prefix.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;

$like         = $wpdb->esc_like('_transient_gguide_') . '%';
$like_timeout = $wpdb->esc_like('_transient_timeout_gguide_') . '%';
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $like,
        $like_timeout
    )
);
