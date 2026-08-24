<?php
/**
 * Plugin Name:       DCC Wildlife
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       "On the Canal This Month" — wildlife spotlight, field guide and guest sightings log for Dora Canal Court. 100% WordPress-native: no external services, no API keys, no CDN scripts.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-wildlife
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DCC_WL_VERSION', '1.0.0' );
define( 'DCC_WL_FILE', __FILE__ );
define( 'DCC_WL_DIR', plugin_dir_path( __FILE__ ) );
define( 'DCC_WL_URL', plugin_dir_url( __FILE__ ) );

require_once DCC_WL_DIR . 'includes/class-species.php';
require_once DCC_WL_DIR . 'includes/class-settings.php';
require_once DCC_WL_DIR . 'includes/class-sightings.php';
require_once DCC_WL_DIR . 'includes/class-render.php';
require_once DCC_WL_DIR . 'includes/class-plugin.php';

register_activation_hook( __FILE__, [ Plugin::class, 'on_activate' ] );

Plugin::instance();
