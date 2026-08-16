<?php
/**
 * Plugin Name:       DCC Checkout Customizations
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Self-contained customizations for the MotoPress Hotel Booking checkout on doracanalcourt.com. Restyles the checkout to match the DCC Contact Form look, adds a conditional second-guest flow, and adds a Cottage 34 "traveling with a dog?" flow that applies a per-night pet fee via native MotoPress Services. Touches no MotoPress core files — CSS + vanilla JS + WordPress/MotoPress hooks only. Loads on the checkout page only.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-checkout
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCC_CHECKOUT_VERSION', '0.1.0');
define('DCC_CHECKOUT_FILE', __FILE__);
define('DCC_CHECKOUT_DIR', plugin_dir_path(__FILE__));
define('DCC_CHECKOUT_URL', plugin_dir_url(__FILE__));

/**
 * Lazy autoloader for the DCC_Checkout\ namespace.
 * includes/class-<kebab-name>.php, mirroring the sibling plugin's convention.
 */
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCC_Checkout\\', 13) !== 0) {
        return;
    }
    $short = substr($class, 13);
    $file  = DCC_CHECKOUT_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

// MotoPress boots on plugins_loaded; run after it so MPHB() is available.
add_action('plugins_loaded', static function (): void {
    \DCC_Checkout\Plugin::instance()->boot();
}, 20);
