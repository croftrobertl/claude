<?php
/**
 * Plugin Name:       MPHB Availability Calendar
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Elementor widget that displays a mobile-friendly multi-property availability calendar for MotoPress Hotel Booking accommodations. Reads MotoPress's already-synced data via its internal PHP API (no extra HTTP fetches), caches via WordPress transients, and auto-excludes its AJAX endpoint from SpeedyCache Pro.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       mphb-availability-calendar
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MPHBAC_VERSION', '0.1.0');
define('MPHBAC_FILE', __FILE__);
define('MPHBAC_DIR', plugin_dir_path(__FILE__));
define('MPHBAC_URL', plugin_dir_url(__FILE__));
define('MPHBAC_AJAX_ACTION', 'mphbac_query');

require_once MPHBAC_DIR . 'includes/class-cache.php';
require_once MPHBAC_DIR . 'includes/class-cache-integration.php';
require_once MPHBAC_DIR . 'includes/class-data-provider.php';
require_once MPHBAC_DIR . 'includes/class-ajax.php';
require_once MPHBAC_DIR . 'includes/class-widget.php';
require_once MPHBAC_DIR . 'includes/class-plugin.php';

register_activation_hook(__FILE__, ['\\MPHBAC\\Cache_Integration', 'on_activate']);
register_deactivation_hook(__FILE__, ['\\MPHBAC\\Cache_Integration', 'on_deactivate']);

add_action('plugins_loaded', static function (): void {
    \MPHBAC\Plugin::instance()->boot();
}, 20);
