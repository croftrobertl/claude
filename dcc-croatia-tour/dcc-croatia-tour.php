<?php
/**
 * Plugin Name:       DCC Croatia Tour
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Elementor widget that embeds an interactive Croatia trip tour (Cavtat & Dubrovnik, September 2025). The map, photos, and itinerary are hosted off-site as a static bundle so the WordPress install holds only this thin loader — about 50 KB total.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-croatia-tour
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCC_TOUR_VERSION', '0.1.0');
define('DCC_TOUR_FILE', __FILE__);
define('DCC_TOUR_DIR', plugin_dir_path(__FILE__));
define('DCC_TOUR_URL', plugin_dir_url(__FILE__));
// Default origin of the standalone tour bundle (index.html + bundle.js/css + JSON).
// The Elementor widget exposes this as an overrideable control so the same plugin
// can point at staging or a fork without code changes.
define('DCC_TOUR_DEFAULT_BUNDLE_URL', 'https://croftrobertl.github.io/claude/tour-data/');

// Lazy autoloader — Elementor's Widget_Base is only resolvable after Elementor boots,
// so we must not eagerly require class-widget.php at plugin load time.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCCTour\\', 8) !== 0) {
        return;
    }
    $short = substr($class, 8);
    $file  = DCC_TOUR_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

add_action('plugins_loaded', static function (): void {
    \DCCTour\Plugin::instance()->boot();
}, 20);
