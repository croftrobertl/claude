<?php
/**
 * Uninstall cleanup for DCC Seasons: remove the single option row and the
 * short-lived cache-purge notice transient.
 *
 * @package DCC_Seasons
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('dcc_seasons_options');
delete_option('dcc_seasons_version');
delete_transient('dcc_seasons_purge_notice');
