<?php
/**
 * Plugin Name: DCC Ragusa
 * Plugin URI:  https://doracanalcourt.com/
 * Description: The walls of doracanalcourt.com. Minčeta watches the files, Bokar guards the login, Revelin keeps the sealed copies, Lovrijenac reads the warnings, Sveti Ivan checks every update.
 * Version:     0.1.2
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * Author:      Dora Canal Court
 * Text Domain: dcc-ragusa
 *
 * Zero weight for guests: on a front-end request this file defines three
 * constants and returns. No hook, no query, no asset. Ragusa works only in
 * wp-admin, in cron, on the login page, in WP-CLI and inside the upgrader,
 * which always runs in one of those.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCCR_VERSION', '0.1.2');
define('DCCR_FILE', __FILE__);
define('DCCR_DIR', __DIR__ . '/');

/**
 * Whether this request is one Ragusa works in.
 *
 * `$pagenow` is set by wp-includes/vars.php, which WordPress loads before
 * the active plugins, so it is readable here.
 */
function dccr_request_is_watched(): bool
{
    if (defined('DCCR_TESTING') && DCCR_TESTING) {
        return true;
    }
    if (function_exists('is_admin') && is_admin()) {
        return true;
    }
    if (function_exists('wp_doing_cron') && wp_doing_cron()) {
        return true;
    }
    if (defined('WP_CLI') && WP_CLI) {
        return true;
    }
    return (($GLOBALS['pagenow'] ?? '') === 'wp-login.php');
}

if (!dccr_request_is_watched()) {
    return;
}

define('DCCR_BASENAME', plugin_basename(__FILE__));
define('DCCR_URL', plugin_dir_url(__FILE__));

spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCCR\\', 5) !== 0) {
        return;
    }
    $parts = explode('\\', substr($class, 5));
    $name  = strtolower(str_replace('_', '-', array_pop($parts)));
    $dir   = DCCR_DIR . 'includes/';
    if ($parts === ['Fortress']) {
        $dir .= 'fortresses/';
    } elseif ($parts === ['Action']) {
        $dir .= 'actions/';
    }
    $file = $dir . 'class-' . $name . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

register_activation_hook(__FILE__, ['DCCR\\Plugin', 'activate']);
register_deactivation_hook(__FILE__, ['DCCR\\Plugin', 'deactivate']);

/*
 * The 10-minute schedule is registered here, at file load, not in boot():
 * activation runs after plugins_loaded, so a filter added in boot() would
 * not exist yet and WordPress would refuse the unknown recurrence silently.
 */
add_filter('cron_schedules', ['DCCR\\Cron', 'schedules']);

add_action('plugins_loaded', ['DCCR\\Plugin', 'boot'], 20);
