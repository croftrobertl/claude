<?php
/**
 * Plugin Name:       DCC Seasons
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Date-scheduled seasonal ambient particles plus a 5-tap Matrix-style easter egg on the site logo. Cache-safe (the visitor's browser picks the active theme from its local date, so cached HTML never bakes in "today"), performance-first, no libraries, no image assets.
 * Version:           3.6.0
 * Requires at least: 6.3
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-seasons
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCC_SEASONS_VERSION', '3.6.0');
define('DCC_SEASONS_FILE', __FILE__);
define('DCC_SEASONS_DIR', plugin_dir_path(__FILE__));
define('DCC_SEASONS_URL', plugin_dir_url(__FILE__));

// Lazy autoloader for DCC_Seasons\ classes (same pattern as the sibling
// mphb-availability-calendar plugin).
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCC_Seasons\\', 12) !== 0) {
        return;
    }
    $short = substr($class, 12);
    $file  = DCC_SEASONS_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

add_action('plugins_loaded', static function (): void {
    \DCC_Seasons\Plugin::instance()->boot();
}, 20);
