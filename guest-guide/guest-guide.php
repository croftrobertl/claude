<?php
/**
 * Plugin Name:       Guest Guide
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Elementor widget that displays an interactive, mobile-friendly Guest Guide. Sections (WiFi, rules, checkout, etc.) appear as a tile menu; tapping one drills into its items (rich text, icons, copy-to-clipboard). All content is authored in the Elementor panel — no code edits, no database, no AJAX.
 * Version:           1.1.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       guest-guide
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('GGUIDE_VERSION', '1.1.0');
define('GGUIDE_FILE', __FILE__);
define('GGUIDE_DIR', plugin_dir_path(__FILE__));
define('GGUIDE_URL', plugin_dir_url(__FILE__));

// Lazy autoloader for GuestGuide\ classes. As with the availability-calendar
// plugin, we must not require class-widget.php eagerly — its
// 'extends \Elementor\Widget_Base' parent reference is resolved at parse time,
// and Elementor's class is only autoloadable AFTER Elementor's own boot
// finishes. Lazy loading defers the parse to the moment a class is used.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'GuestGuide\\', 11) !== 0) {
        return;
    }
    $short = substr($class, 11);
    $file  = GGUIDE_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

add_action('plugins_loaded', static function (): void {
    \GuestGuide\Plugin::instance()->boot();
}, 20);
