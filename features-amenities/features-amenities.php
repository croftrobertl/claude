<?php
/**
 * Plugin Name:       DCC Features and Amenities
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Adds an Elementor widget that renders a sectioned list of features and amenities for the Dora Canal Court cottages.
 * Version:           1.10.2
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * Text Domain:       features-amenities
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FA_VERSION', '1.10.2' );
define( 'FA_FILE', __FILE__ );
define( 'FA_DIR', plugin_dir_path( __FILE__ ) );
define( 'FA_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( $class ) {
		$prefix = 'FeaturesAmenities\\';
		if ( strncmp( $class, $prefix, strlen( $prefix ) ) !== 0 ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$file     = FA_DIR . 'includes/class-' . strtolower( str_replace( '_', '-', $relative ) ) . '.php';
		if ( is_readable( $file ) ) {
			require_once $file;
		}
	}
);

\FeaturesAmenities\Plugin::instance()->boot();
