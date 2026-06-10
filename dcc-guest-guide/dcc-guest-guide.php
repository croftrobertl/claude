<?php
/**
 * Plugin Name:       DCC Guest Guide
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Elementor widget that displays a sectioned, mobile-friendly guest guide (Wi-Fi, hot tub, local tips, etc.) with grid/list/masonry/bento/carousel/split-pane layouts, stage-swap/accordion/flip-card reveal modes, theme presets with auto dark mode, and a Cmd-K search.
 * Version:           0.9.5
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-guest-guide
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCCGG_VERSION', '0.9.5');
define('DCCGG_FILE', __FILE__);
define('DCCGG_DIR', plugin_dir_path(__FILE__));
define('DCCGG_URL', plugin_dir_url(__FILE__));

// Lazy autoloader for DCCGG\ classes. Widget extends \Elementor\Widget_Base,
// whose parent reference resolves at parse time — Elementor's autoload isn't
// ready until after its own boot, so we defer the parse to actual use.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCCGG\\', 6) !== 0) {
        return;
    }
    $short = substr($class, 6);
    $file  = DCCGG_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

add_action('plugins_loaded', static function (): void {
    \DCCGG\Plugin::instance()->boot();
}, 20);
