<?php
/**
 * Plugin Name: DCC Ragusa
 * Plugin URI:  https://doracanalcourt.com/
 * Description: The walls of doracanalcourt.com. Minčeta watches the files, Bokar guards the login, Revelin keeps the sealed copies, Lovrijenac reads the warnings, Sveti Ivan checks every update.
 * Version:     0.2.9
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * Author:      Dora Canal Court
 * Text Domain: dcc-ragusa
 *
 * Zero weight for guests: on a front-end request this file defines three
 * constants, adds the three upgrader listeners and returns. No query, no
 * asset, no Ragusa class. Ragusa works in wp-admin, in cron, on the login
 * page, in WP-CLI, and inside the upgrader wherever it runs: WordPress.com
 * and Jetpack update plugins from front-end requests (the REST API,
 * XML-RPC, and Jetpack's /?for=jetpack&jetpack=comms endpoint).
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCCR_VERSION', '0.2.9');
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

/** Ragusa's classes, from includes/, on first use. Once per request. */
function dccr_load(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    if (!defined('DCCR_BASENAME')) {
        define('DCCR_BASENAME', plugin_basename(DCCR_FILE));
    }
    if (!defined('DCCR_URL')) {
        define('DCCR_URL', plugin_dir_url(DCCR_FILE));
    }
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
}

/*
 * The harbour on a guest request. An update made from WordPress.com runs
 * inside a front-end request here (Jetpack's comms endpoint, REST, XML-RPC),
 * which the gate does not load Ragusa for. These three listeners cost an
 * array entry each until an upgrader fires them; only then is Ragusa loaded.
 * In a watched request Plugin::boot() adds the same callbacks itself.
 */
function dccr_harbour_pre_install($res, $hook_extra = [])
{
    dccr_load();
    return \DCCR\Fortress\Sveti_Ivan::on_pre_install($res, $hook_extra);
}

function dccr_harbour_source_selection($source, $remote_source = '', $upgrader = null, $hook_extra = [])
{
    dccr_load();
    return \DCCR\Fortress\Revelin::on_source_selection($source, $remote_source, $upgrader, $hook_extra);
}

function dccr_harbour_process_complete($upgrader = null, $hook_extra = []): void
{
    dccr_load();
    \DCCR\Fortress\Sveti_Ivan::on_process_complete($upgrader, $hook_extra);
}

if (!dccr_request_is_watched()) {
    add_filter('upgrader_pre_install', 'dccr_harbour_pre_install', 10, 2);
    add_filter('upgrader_source_selection', 'dccr_harbour_source_selection', 10, 4);
    add_action('upgrader_process_complete', 'dccr_harbour_process_complete', 10, 2);
    return;
}

dccr_load();

register_activation_hook(__FILE__, ['DCCR\\Plugin', 'activate']);
register_deactivation_hook(__FILE__, ['DCCR\\Plugin', 'deactivate']);

/*
 * The 10-minute schedule is registered here, at file load, not in boot():
 * activation runs after plugins_loaded, so a filter added in boot() would
 * not exist yet and WordPress would refuse the unknown recurrence silently.
 */
add_filter('cron_schedules', ['DCCR\\Cron', 'schedules']);

add_action('plugins_loaded', ['DCCR\\Plugin', 'boot'], 20);
