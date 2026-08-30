<?php
/**
 * DCC Wildlife — uninstall (1.8.0).
 *
 * Deliberately conservative: on this site deleting and re-uploading the
 * plugin zip is routine, so hand-tuned settings must survive an accidental
 * delete-then-reinstall. Cached data (transients) is always removed — it is
 * disposable — but options and old content go only when the owner opted in
 * via "Delete all plugin data when the plugin is uninstalled" on the
 * settings page (default off).
 *
 * The countdown toggle (dcc_wl_countdown_enabled) is shared history with the
 * dcc-wildlife-countdown.php mu-plugin. While that file still exists the
 * option is NOT this plugin's to delete, opt-in or not; once the mu-plugin
 * is gone it follows the opt-in like everything else.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// Transients: always. Underscores are escaped — in LIKE they are wildcards.
$wpdb->query(
	"DELETE FROM {$wpdb->options}
	 WHERE option_name LIKE '\_transient\_dcc\_wl\_%'
	    OR option_name LIKE '\_transient\_timeout\_dcc\_wl\_%'"
);

// Version bookkeeping: always. It only drives upgrade routines.
delete_option( 'dcc_wl_version' );

$settings = get_option( 'dcc_wl_water', [] );
if ( ! is_array( $settings ) || empty( $settings['delete_on_uninstall'] ) ) {
	return; // No opt-in: settings and content stay for the next install.
}

delete_option( 'dcc_wl_water' );
delete_option( 'dcc_wl_settings' ); // Orphan from the sightings feature removed in 1.2.0.

// The shared countdown toggle: only once the mu-plugin no longer exists.
$mu_dir = defined( 'WPMU_PLUGIN_DIR' ) ? WPMU_PLUGIN_DIR : WP_CONTENT_DIR . '/mu-plugins';
if ( ! file_exists( $mu_dir . '/dcc-wildlife-countdown.php' ) ) {
	delete_option( 'dcc_wl_countdown_enabled' );
}

// Guest sighting posts from the feature removed in 1.2.0, if any remain.
$sightings = get_posts(
	[
		'post_type'      => 'dcc_wl_sighting',
		'post_status'    => 'any',
		'numberposts'    => -1,
		'fields'         => 'ids',
		'no_found_rows'  => true,
	]
);
foreach ( $sightings as $post_id ) {
	wp_delete_post( (int) $post_id, true );
}
