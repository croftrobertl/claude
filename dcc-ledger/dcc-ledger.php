<?php
/**
 * Plugin Name:       DCC Ledger
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       A separate, permanent money ledger for Dora Canal Court. Imports Airbnb, Booking.com and Vrbo reservation, payout and invoice exports into its own tables, links them read-only to MotoPress bookings, and reports guest totals, platform fees, taxes, payouts, nights and occupancy by month, season or year. Never writes to MotoPress. Stores no guest names or contact details.
 * Version:           0.1.2
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-ledger
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCCL_VERSION', '0.1.2');
define('DCCL_FILE', __FILE__);
define('DCCL_DIR', plugin_dir_path(__FILE__));
define('DCCL_URL', plugin_dir_url(__FILE__));

require_once DCCL_DIR . 'includes/autoload.php';

register_activation_hook(__FILE__, static function (): void {
    \DCCL\Schema::on_activate();
    // Surface a MotoPress key mismatch straight away, rather than as a figure
    // of zero on the first report someone opens.
    \DCCL\Health::on_activate();
});

add_action('plugins_loaded', static function (): void {
    \DCCL\Plugin::instance()->boot();
}, 20);
