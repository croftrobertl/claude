<?php
/**
 * Uninstall handler. The plugin stores no options, transients, or custom tables
 * (preferences live only in the visitor's browser via localStorage), so there is
 * nothing to clean up server-side.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
