<?php
/**
 * Plugin Name:       DCC Ledger
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       A separate, permanent money ledger for Dora Canal Court. Imports Airbnb, Booking.com and Vrbo reservation, payout and invoice exports into its own tables, links them read-only to MotoPress bookings, and reports guest totals, platform fees, taxes, payouts, nights and occupancy by month, season or year. Never writes to MotoPress. Stores no guest names or contact details.
 * Version: 0.3.1
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

define('DCCL_VERSION', '0.3.1');
define('DCCL_FILE', __FILE__);
define('DCCL_DIR', plugin_dir_path(__FILE__));
define('DCCL_URL', plugin_dir_url(__FILE__));

require_once DCCL_DIR . 'includes/autoload.php';

register_activation_hook(__FILE__, static function (): void {
    \DCCL\Schema::on_activate();
    // 0.2.0: convert the stored decimals to whole cents, after backing them
    // up and only if every total ties before and after.
    \DCCL\Money_Migration::run();
    // An install that ever ran 0.1.3 may carry links pointing at a stay that
    // does not exist. Removed as a recorded, undoable batch.
    \DCCL\Repair::on_upgrade();
    // Surface a MotoPress key mismatch straight away, rather than as a figure
    // of zero on the first report someone opens.
    \DCCL\Health::on_activate();
    // Start recording booking pace tonight. Nothing is reconstructed: a
    // curve drawn from today's bookings would show what survived, not what
    // stood.
    if (!wp_next_scheduled(\DCCL\Pace::HOOK)) {
        wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', \DCCL\Pace::HOOK);
    }
});

register_deactivation_hook(__FILE__, static function (): void {
    $next = wp_next_scheduled(\DCCL\Pace::HOOK);
    if ($next) {
        wp_unschedule_event($next, \DCCL\Pace::HOOK);
    }
});

add_action('plugins_loaded', static function (): void {
    \DCCL\Plugin::instance()->boot();
}, 20);
