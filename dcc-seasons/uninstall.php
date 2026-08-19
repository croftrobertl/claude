<?php
/**
 * Uninstall cleanup for DCC Seasons: remove the single option row.
 *
 * @package DCC_Seasons
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('dcc_seasons_options');
