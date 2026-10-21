<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Registers every hook Ragusa uses. Only reached in wp-admin, cron, WP-CLI
 * and on the login page (the main file returns early everywhere else).
 */
final class Plugin
{
    public const TICK_HOOK   = 'dccr_tick';
    public const CHECK_HOOK  = 'dccr_update_check';
    public const DIGEST_HOOK = 'dccr_digest';

    public static function boot(): void
    {
        load_plugin_textdomain('dcc-ragusa', false, dirname(DCCR_BASENAME) . '/languages');

        // Cron.
        add_filter('cron_schedules', [Cron::class, 'schedules']);
        add_action(self::TICK_HOOK, [Cron::class, 'tick']);
        add_action(self::CHECK_HOOK, [Fortress\Sveti_Ivan::class, 'scheduled_check']);
        add_action(self::DIGEST_HOOK, [Alerts::class, 'send_digest']);

        // The harbour: every install and update, from any route.
        add_filter('upgrader_pre_install', [Fortress\Sveti_Ivan::class, 'on_pre_install'], 10, 2);
        add_filter('upgrader_source_selection', [Fortress\Revelin::class, 'on_source_selection'], 10, 4);
        add_action('upgrader_process_complete', [Fortress\Sveti_Ivan::class, 'on_process_complete'], 10, 2);

        // The gate: only on the login page.
        if (($GLOBALS['pagenow'] ?? '') === 'wp-login.php') {
            add_action('wp_login', [Fortress\Bokar::class, 'on_login'], 10, 2);
        }

        if (is_admin()) {
            Admin::register();
        }

        if (defined('WP_CLI') && WP_CLI && class_exists('WP_CLI')) {
            \WP_CLI::add_command('ragusa', Cli::class);
        }
    }

    public static function activate(): void
    {
        Schema::ensure();
        Settings::get();
        Vault::dir();
        Cron::schedule();
        State::set('activated_at', time());
        State::flush();
        Events::record(Fortress::REVELIN, Events::INFO, 'activated', 'dcc-ragusa', sprintf(
            /* translators: %s: version */
            __('Ragusa %s activated.', 'dcc-ragusa'),
            DCCR_VERSION
        ));
    }

    public static function deactivate(): void
    {
        Cron::unschedule();
        Events::record(Fortress::REVELIN, Events::NEEDS_LOOK, 'deactivated', 'dcc-ragusa', __('Ragusa was deactivated.', 'dcc-ragusa'));
        if (Site::is_live()) {
            Alerts::send(
                Fortress::REVELIN,
                __('Ragusa Was Deactivated', 'dcc-ragusa'),
                __('Ragusa was deactivated from the Plugins screen or WP-CLI.', 'dcc-ragusa') . "\n\n"
                . __('Ragusa did nothing: it was switched off, so it cannot act.', 'dcc-ragusa') . "\n\n"
                . __('If this was not you, reactivate it from Plugins and change the administrator passwords.', 'dcc-ragusa')
            );
            Heartbeat::ping(false, __('Ragusa was deactivated', 'dcc-ragusa'));
        }
    }
}
