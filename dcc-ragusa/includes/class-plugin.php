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

        // Cron. The schedule itself is registered in the main file at load.
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

        // Self-heal: the tick must exist, whatever happened at activation.
        // wp_next_scheduled() reads the autoloaded cron option: no extra query.
        Cron::ensure();
        self::maybe_upgrade();
    }

    /** One-time steps when a new version runs for the first time. */
    public static function maybe_upgrade(): void
    {
        $seen = (string) get_option('dcc_ragusa_version', '');
        if ($seen === DCCR_VERSION) {
            return;
        }
        try {
            Schema::ensure();
            if ($seen === '' || version_compare($seen, '0.1.1', '<')) {
                // 0.1.0 treated only the first chunk of the first pass as the
                // baseline and flagged the rest as new. An existing index is
                // the baseline; the findings it raised are withdrawn quietly.
                if (Fortress\Minceta::index() !== []) {
                    State::set('minceta.baselined', true);
                    State::set('uploads_ht_baselined', true);
                }
                Alerts::withdraw(Fortress::MINCETA, ['file-new', 'file-changed', 'file-missing']);
            }
            if ($seen === '' || version_compare($seen, '0.1.2', '<')) {
                // 0.1.0 read every privileged user as an editor; its baseline is
                // retaken on the next tick and the role "changes" it raised withdrawn.
                $b = get_option('dcc_ragusa_baselines', []);
                if (is_array($b) && isset($b['users'])) {
                    unset($b['users']);
                    update_option('dcc_ragusa_baselines', $b, 'no');
                }
                Alerts::withdraw(Fortress::BOKAR, ['role-changed', 'user-new', 'user-gone']);
                Alerts::withdraw(Fortress::MINCETA, ['option-changed']);
            }
            if (get_option('dcc_ragusa_version', null) === null) {
                add_option('dcc_ragusa_version', DCCR_VERSION, '', 'no');
            } else {
                update_option('dcc_ragusa_version', DCCR_VERSION, 'no');
            }
            if ($seen !== '') {
                Events::record(Fortress::REVELIN, Events::INFO, 'upgraded', 'dcc-ragusa', sprintf(
                    /* translators: 1: old, 2: new */
                    __('Ragusa upgraded from %1$s to %2$s.', 'dcc-ragusa'),
                    $seen,
                    DCCR_VERSION
                ));
            }
            State::flush();
        } catch (\Throwable $e) {
            // An upgrade step must never take the admin down.
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
