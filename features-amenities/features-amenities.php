<?php
/**
 * Plugin Name:       Features & Amenities Widget
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Adds an Elementor widget that renders a sectioned list of features and amenities for the Dora Canal Court cottages.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * Text Domain:       features-amenities
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FA_VERSION', '1.0.0' );
define( 'FA_FILE', __FILE__ );
define( 'FA_DIR', plugin_dir_path( __FILE__ ) );
define( 'FA_URL', plugin_dir_url( __FILE__ ) );

require_once FA_DIR . 'includes/class-plugin.php';

\FeaturesAmenities\Plugin::instance()->boot();
