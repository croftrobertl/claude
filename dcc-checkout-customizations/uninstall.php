<?php
/**
 * Uninstall handler for DCC Checkout Customizations.
 *
 * This plugin stores no options and creates no tables — it only adds CSS/JS and
 * hooks. The one thing it writes is per-booking dog info saved to `mphb_booking`
 * post meta (Part D). That meta is legitimate booking data belonging to real
 * reservations, so we intentionally do NOT delete it on uninstall; removing the
 * plugin should never destroy records attached to a customer's booking.
 *
 * Nothing to clean up here.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
