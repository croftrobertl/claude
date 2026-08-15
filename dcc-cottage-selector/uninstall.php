<?php
/**
 * Uninstall handler. The only server-side state the plugin writes is the shared
 * design registry used by the Mini-Entry mirror feature (see
 * Selector_Widget::publish_design()); remove it so nothing is orphaned.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('dccs_design_sources');
