<?php
/**
 * Uninstall handler for DCC Custom Checkout.
 *
 * Removes ONE thing: the settings saved on the "DCC Custom Checkout" admin
 * page (the dcc_checkout_settings option). Everything else this plugin stores
 * is deliberately KEPT (this list corrected 2026-10-09; it used to say the
 * plugin stored one option):
 *
 *  - dcc_guest34_enabled — a standalone option because the DCC Cottage
 *    Selector reads it too, and "absent" means ON: deleting it here would
 *    silently switch Guests 3 and 4 back on in the other plugin.
 *  - Booking post meta: _dcc_policy_acceptance and _dcc_policy_staff (who
 *    accepted which policy version), _dcc_id_deletions (the photo-ID
 *    deletion log), and _mphb_adults / _mphb_adults_confirmed on reserved
 *    rooms (guest counts the owner set; MotoPress's own key, and the
 *    Availability Calendar's contract).
 *  - dcc_policy_version posts — the saved policy texts those records point at.
 *  - The "Bringing a boat or trailer?" Checkout Field (v0.31.0) and its
 *    marker option dcc_checkout_boat_field. The field is MotoPress's own now,
 *    holds guests' answers, and the Availability Calendar reads it; the
 *    marker is what keeps a deleted field from ever being recreated.
 *  - Per-booking dog info, written by MotoPress from its native Checkout
 *    Fields.
 *
 * All of that is booking data belonging to real reservations, and removing
 * the plugin must never destroy records attached to a customer's booking.
 * The dcc_checkout_id_guards transient expires on its own within an hour.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('dcc_checkout_settings');
