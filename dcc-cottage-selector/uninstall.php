<?php
/**
 * Runs when the plugin is DELETED from Plugins > Installed (not on deactivation).
 *
 * Removes only what this plugin wrote. dcc_guest34_enabled is deliberately NOT
 * here: DCC Custom Checkout writes it and this plugin only reads it, so deleting
 * it would silently change the checkout's behaviour.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
delete_option('dccs_design_sources');   // the published-design registry
delete_option('dccs_settings');         // the DCC > Cottage Selector settings page (0.44.0)
