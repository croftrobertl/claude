<?php
/**
 * Plugin Name:       DCC Wildlife
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       "On the Canal This Month" wildlife guide, plus a fishing & water-conditions module for Dora Canal Court. The wildlife guide and the water almanac are 100% WordPress-native — no external services. An optional, off-by-default live layer fetches public USGS and NWS data server-side; no API keys, no accounts, no CDN scripts.
 * Version:           1.16.2
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

define( 'DCC_WL_VERSION', '1.16.2' );
define( 'DCC_WL_FILE', __FILE__ );
define( 'DCC_WL_DIR', plugin_dir_path( __FILE__ ) );
define( 'DCC_WL_URL', plugin_dir_url( __FILE__ ) );

require_once DCC_WL_DIR . 'includes/class-species.php';
require_once DCC_WL_DIR . 'includes/class-sprites.php';
require_once DCC_WL_DIR . 'includes/class-render.php';
require_once DCC_WL_DIR . 'includes/class-water-fact.php';
require_once DCC_WL_DIR . 'includes/class-water-data.php';
require_once DCC_WL_DIR . 'includes/class-water-live.php';
require_once DCC_WL_DIR . 'includes/class-water-rest.php';
require_once DCC_WL_DIR . 'includes/class-water-render.php';
require_once DCC_WL_DIR . 'includes/class-water-admin.php';
require_once DCC_WL_DIR . 'includes/class-canal-render.php';
require_once DCC_WL_DIR . 'includes/class-plugin.php';

Plugin::instance();
