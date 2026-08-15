<?php
/**
 * Plugin Name:       DCC Cottage Selector
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Mobile-first decision tool that helps guests choose among the 8 Dora Canal Court cottages by focusing only on their real differences. Adds two Elementor widgets (a full Selector and a compact cross-sell Mini-Entry) plus a [dcc_selector_entry] shortcode. Pure static data, fully client-rendered — no MotoPress dependency.
 * Version:           0.19.4
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-cottage-selector
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCCS_VERSION', '0.19.4');
define('DCCS_FILE', __FILE__);
define('DCCS_DIR', plugin_dir_path(__FILE__));
define('DCCS_URL', plugin_dir_url(__FILE__));

// Lazy autoloader for DCCS\ classes. We must not require the widget classes
// eagerly — they 'extends \Elementor\Widget_Base', whose parent reference is
// resolved at parse time, and Elementor's class is only autoloadable AFTER
// Elementor finishes booting (later than plugins_loaded:20). Lazy loading defers
// the parse to the moment a class is actually used.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCCS\\', 5) !== 0) {
        return;
    }
    $short = substr($class, 5);
    $file  = DCCS_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

add_action('plugins_loaded', static function (): void {
    \DCCS\Plugin::instance()->boot();
}, 20);
