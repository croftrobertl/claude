<?php
/**
 * Plugin Name:       DCC Custom Checkout
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Customizations for MotoPress Hotel Booking on doracanalcourt.com. Checkout: restyled to the site standard; extra-guest details and fee; the Cottage 34 "Traveling with a dog?" pet fee via native MotoPress Services; the acceptance box with both policy links and an acceptance record on each online booking; creates the "Bringing a boat or trailer?" Checkout Field. WP-Admin booking screens: the customer fields in the owner's order, shown or hidden by guest count and pet fee; an "Extra Details/Options" box for the pet and boat questions; a guest-count control; new iCal imports start at 2 guests; photo-ID deletion; clearer Add New results labels. Front-end files load on the checkout page only. Touches no MotoPress core files.
 * Version:           0.32.0
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

define('DCC_CHECKOUT_VERSION', '0.32.0');
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

/**
 * On activation, make sure the guest-ID store carries its guard files. This is
 * the one moment we are certain to get, and a store without them is sixteen
 * driving licences behind nothing but obscurity.
 */
register_activation_hook(__FILE__, static function (): void {
    \DCC_Checkout\Id_Files::on_activate();
});

// MotoPress boots on plugins_loaded; run after it so MPHB() is available.
add_action('plugins_loaded', static function (): void {
    \DCC_Checkout\Plugin::instance()->boot();
}, 20);
