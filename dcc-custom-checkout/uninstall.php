<?php
/**
 * Uninstall handler for DCC Custom Checkout.
 *
 * The plugin stores one option — the settings saved on the "DCC Custom
 * Checkout" admin page — which is removed here.
 *
 * Per-booking dog info (Part D) lives in `mphb_booking` post meta, written by
 * MotoPress from its native Checkout Fields. That meta is legitimate booking
 * data belonging to real reservations, so it is intentionally NOT deleted:
 * removing the plugin should never destroy records attached to a customer's
 * booking.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('dcc_checkout_settings');
