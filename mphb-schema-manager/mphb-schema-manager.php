<?php
/**
 * Plugin Name:       MPHB Schema Manager
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Per-page Schema.org (JSON-LD) structured-data manager for MotoPress Hotel Booking sites built with Elementor. Edit schema per page/post/cottage in the Elementor Settings tab, inherit site-wide and accommodation-type defaults, auto-fill live MotoPress price/availability, import existing Custom HTML JSON-LD, and validate. Independent of the MPHB Availability Calendar plugin.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       mphb-schema-manager
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MPHBSCHEMA_VERSION', '1.0.0');
define('MPHBSCHEMA_FILE', __FILE__);
define('MPHBSCHEMA_DIR', plugin_dir_path(__FILE__));
define('MPHBSCHEMA_URL', plugin_dir_url(__FILE__));

// Lazy autoloader for MPHBSchema\ classes. Deferred so classes that reference
// Elementor parents aren't parsed before Elementor has booted.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'MPHBSchema\\', 11) !== 0) {
        return;
    }
    $short = substr($class, 11);
    $file  = MPHBSCHEMA_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

register_deactivation_hook(__FILE__, ['\\MPHBSchema\\Cache', 'flush_all']);

add_action('plugins_loaded', static function (): void {
    \MPHBSchema\Plugin::instance()->boot();
}, 20);
