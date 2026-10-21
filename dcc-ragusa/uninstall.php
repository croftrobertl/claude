<?php
/**
 * Uninstall: keeps everything unless "delete on uninstall" was ticked.
 * Removes only this site's vault folder, never another site's and never
 * ~/mu-backups/.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$dccr_settings = get_option('dcc_ragusa_settings', []);
if (!is_array($dccr_settings) || empty($dccr_settings['delete_on_uninstall'])) {
    return;
}

define('DCCR_TESTING', true);
define('DCCR_UNINSTALLING', true);
require_once __DIR__ . '/dcc-ragusa.php';

$dccr_vault = DCCR\Vault::dir();
DCCR\Schema::drop();
foreach (['dcc_ragusa_settings', 'dcc_ragusa_secrets', 'dcc_ragusa_state', 'dcc_ragusa_alerts', 'dcc_ragusa_baselines', 'dcc_ragusa_markers', 'dcc_ragusa_logins', 'dcc_ragusa_db_version', 'dcc_ragusa_lock', 'dcc_ragusa_active_plugins_seen', 'dcc_ragusa_zelenci'] as $dccr_option) {
    delete_option($dccr_option);
}
wp_unschedule_hook('dccr_tick');
wp_unschedule_hook('dccr_update_check');
wp_unschedule_hook('dccr_digest');
if (is_dir($dccr_vault) && str_contains($dccr_vault, '/ragusa-vault/') && !str_contains($dccr_vault, 'mu-backups')) {
    DCCR\Vault::rm_rf($dccr_vault);
}
