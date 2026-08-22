<?php
/**
 * Plugin Name:       DCC Availability Calendar
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Elementor widget that displays a mobile-friendly multi-property availability calendar for MotoPress Hotel Booking accommodations. Reads MotoPress's already-synced bookings directly from the database (no extra HTTP fetches), caches via WordPress transients, and auto-excludes its AJAX endpoint from SpeedyCache Pro.
 * Version:           0.18.0
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

define('MPHBAC_VERSION', '0.18.0');
define('MPHBAC_FILE', __FILE__);
define('MPHBAC_DIR', plugin_dir_path(__FILE__));
define('MPHBAC_URL', plugin_dir_url(__FILE__));
define('MPHBAC_AJAX_ACTION', 'mphbac_query');

// Lazy autoloader for MPHBAC\ classes. We must not require class-widget.php
// eagerly — its 'extends \Elementor\Widget_Base' parent reference is resolved at
// parse time, and Elementor's class is only autoloadable AFTER Elementor's own
// boot finishes (which happens later than plugins_loaded:20 for this contextual
// reason). Lazy loading defers the parse to the moment a class is actually used.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'MPHBAC\\', 7) !== 0) {
        return;
    }
    $short = substr($class, 7);
    $file  = MPHBAC_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

register_activation_hook(__FILE__, ['\\MPHBAC\\Cache_Integration', 'on_activate']);
register_deactivation_hook(__FILE__, ['\\MPHBAC\\Cache_Integration', 'on_deactivate']);

add_action('plugins_loaded', static function (): void {
    \MPHBAC\Plugin::instance()->boot();
}, 20);
