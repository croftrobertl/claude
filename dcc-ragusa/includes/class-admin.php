<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The Ragusa page under the DCC menu. manage_options plus a nonce on every
 * action; no AJAX, no REST. Seal and Restore go through a confirmation
 * screen that says what will change.
 */
final class Admin
{
    public const SLUG   = 'dcc-ragusa';
    public const PARENT = 'dcc';
    public const CAP    = 'manage_options';
    public const NONCE  = 'dccr_action';

    public static function register(): void
    {
        add_action('admin_menu', [self::class, 'register_menu']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueue']);
        foreach (['save_settings', 'seal', 'restore', 'update_now', 'check_now', 'seen'] as $action) {
            add_action('admin_post_dccr_' . $action, [self::class, 'handle_' . $action]);
        }
    }

    public static function register_menu(): void
    {
        global $admin_page_hooks;
        if (!isset($admin_page_hooks[self::PARENT])) {
            add_menu_page(__('DCC', 'dcc-ragusa'), __('DCC', 'dcc-ragusa'), self::CAP, self::PARENT, [self::class, 'render'], 'dashicons-shield', 58);
        }
        add_submenu_page(self::PARENT, __('Ragusa', 'dcc-ragusa'), __('Ragusa', 'dcc-ragusa'), self::CAP, self::SLUG, [self::class, 'render']);
    }

    public static function enqueue(string $hook): void
    {
        if (!str_contains($hook, self::SLUG)) {
            return;
        }
        wp_enqueue_style('dccr-admin', DCCR_URL . 'assets/css/admin.css', [], DCCR_VERSION);
    }

    public static function url(array $args = []): string
    {
        return add_query_arg(array_merge(['page' => self::SLUG], $args), admin_url('admin.php'));
    }

    /** A POST form to admin-post.php with the nonce, for a button. */
    public static function form(string $action, array $fields, string $label, string $class = 'button', bool $confirm = false): string
    {
        $html = '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" class="dccr-inline-form">';
        $html .= '<input type="hidden" name="action" value="dccr_' . esc_attr($action) . '">';
        $html .= wp_nonce_field(self::NONCE, '_dccr_nonce', true, false);
        foreach ($fields as $k => $v) {
            $html .= '<input type="hidden" name="' . esc_attr($k) . '" value="' . esc_attr((string) $v) . '">';
        }
        if ($confirm) {
            $html .= '<input type="hidden" name="confirmed" value="1">';
        }
        $html .= '<button type="submit" class="' . esc_attr($class) . '">' . esc_html($label) . '</button></form>';
        return $html;
    }

    public static function render(): void
    {
        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__('You do not have permission to see this page.', 'dcc-ragusa'));
        }
        Schema::ensure();
        Fortress::settle();
        Fortress\Lovrijenac::refresh_php();
        State::flush();
        $confirm = isset($_GET['confirm']) ? sanitize_key(wp_unslash((string) $_GET['confirm'])) : '';
        $notice  = isset($_GET['dccr_notice']) ? sanitize_text_field(wp_unslash((string) $_GET['dccr_notice'])) : '';
        $kind    = isset($_GET['dccr_kind']) ? sanitize_key(wp_unslash((string) $_GET['dccr_kind'])) : 'info';
        if ($confirm !== '' && in_array($confirm, ['seal', 'restore', 'update_now'], true)) {
            $target = isset($_GET['target']) ? sanitize_text_field(wp_unslash((string) $_GET['target'])) : '';
            include DCCR_DIR . 'includes/views/confirm.php';
            return;
        }
        include DCCR_DIR . 'includes/views/page.php';
    }

    // ------------------------------------------------------------ handlers

    private static function guard(): void
    {
        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__('You do not have permission to do that.', 'dcc-ragusa'));
        }
        check_admin_referer(self::NONCE, '_dccr_nonce');
    }

    private static function back(string $notice, string $kind = 'info'): void
    {
        State::flush();
        wp_safe_redirect(self::url(['dccr_notice' => $notice, 'dccr_kind' => $kind]));
        exit;
    }

    private static function post(string $key): string
    {
        return isset($_POST[$key]) ? sanitize_text_field(wp_unslash((string) $_POST[$key])) : '';
    }

    public static function handle_save_settings(): void
    {
        self::guard();
        $in = [
            'alert_email'         => self::post('alert_email'),
            'heartbeat_url'       => isset($_POST['heartbeat_url']) ? trim((string) wp_unslash($_POST['heartbeat_url'])) : '',
            'feed_key'            => isset($_POST['feed_key']) ? trim((string) wp_unslash($_POST['feed_key'])) : '',
            'delete_on_uninstall' => !empty($_POST['delete_on_uninstall']),
            'clear_heartbeat'     => !empty($_POST['clear_heartbeat']),
            'clear_feed_key'      => !empty($_POST['clear_feed_key']),
        ];
        $notices = Settings::save($in);
        self::back($notices === [] ? __('Settings saved.', 'dcc-ragusa') : implode(' ', $notices), $notices === [] ? 'good' : 'warn');
    }

    public static function handle_seal(): void
    {
        self::guard();
        $target = self::post('target');
        if ($target === '' || str_contains($target, '..')) {
            self::back(__('No file named.', 'dcc-ragusa'), 'warn');
        }
        if (self::post('confirmed') !== '1') {
            wp_safe_redirect(self::url(['confirm' => 'seal', 'target' => $target]));
            exit;
        }
        [$ok, $msg] = Fortress\Revelin::seal($target);
        self::back($msg, $ok ? 'good' : 'warn');
    }

    public static function handle_restore(): void
    {
        self::guard();
        $target = self::post('target');
        if ($target === '') {
            self::back(__('No entry named.', 'dcc-ragusa'), 'warn');
        }
        if (self::post('confirmed') !== '1') {
            wp_safe_redirect(self::url(['confirm' => 'restore', 'target' => $target]));
            exit;
        }
        [$ok, $msg] = self::restore($target);
        self::back($msg, $ok ? 'good' : 'warn');
    }

    /** A journal id undoes an action; a vault entry id puts a sealed copy back. */
    public static function restore(string $target): array
    {
        if (ctype_digit($target)) {
            return Actions::reverse((int) $target);
        }
        $entry = Vault::entry($target);
        if ($entry === null) {
            return [false, __('No such journal entry or sealed copy.', 'dcc-ragusa')];
        }
        switch ($entry['kind']) {
            case 'guard':
                $paths = Fortress\Revelin::guards();
                $path  = $paths[$entry['label']] ?? '';
                if ($path === '') {
                    return [false, __('That guard is not in the guard set.', 'dcc-ragusa')];
                }
                $r = Action\Restore_Guard::run(['label' => $entry['label'], 'path' => $path, 'entry' => $entry]);
                return [$r['ok'], $r['message']];
            case 'self':
                $r = Action\Restore_Guard::run(['label' => $entry['label'], 'path' => DCCR_DIR . substr((string) $entry['label'], strlen('dcc-ragusa/')), 'entry' => $entry]);
                return [$r['ok'], $r['message']];
            case 'htaccess-block':
                $r = Action\Htaccess_Block::run(['block' => (string) file_get_contents(Vault::path($entry))]);
                return [$r['ok'], $r['message']];
            case 'plugin':
                $slug = (string) $entry['label'];
                $r    = Action\Rollback::run(['slug' => $slug, 'entry' => $entry, 'check_id' => 0, 'new_version' => Fortress\Revelin::plugin_version($slug), 'old_version' => (string) $entry['version']]);
                return [$r['ok'], $r['message']];
        }
        return [false, __('That kind of entry cannot be restored from here.', 'dcc-ragusa')];
    }

    public static function handle_update_now(): void
    {
        self::guard();
        $slug = self::post('target');
        if ($slug === '' || !preg_match('/^[a-z0-9._-]+$/i', $slug)) {
            self::back(__('No plugin named.', 'dcc-ragusa'), 'warn');
        }
        if (self::post('confirmed') !== '1') {
            wp_safe_redirect(self::url(['confirm' => 'update_now', 'target' => $slug]));
            exit;
        }
        Fortress\Sveti_Ivan::$printer = null;
        [$ok, $msg] = Fortress\Lovrijenac::update_now($slug);
        self::back($msg, $ok ? 'good' : 'warn');
    }

    public static function handle_check_now(): void
    {
        self::guard();
        $report = Cron::tick(new Budget(20.0), true);
        self::back(__('Checked now.', 'dcc-ragusa') . ' ' . implode(' ', array_slice($report, -2)), 'good');
    }

    /**
     * Mark As Seen: a logged-in administrator, a nonce, and a record of who
     * and when. Never one click from an email: the email links to the page.
     */
    public static function handle_seen(): void
    {
        self::guard();
        $fp = self::post('target');
        if (!preg_match('/^[a-f0-9]{40}$/', $fp)) {
            self::back(__('Nothing marked.', 'dcc-ragusa'), 'warn');
        }
        $user = function_exists('wp_get_current_user') ? wp_get_current_user() : null;
        $name = is_object($user) && !empty($user->display_name) ? (string) $user->display_name : __('an administrator', 'dcc-ragusa');
        if (Alerts::mark_seen($fp, $name)) {
            Fortress::settle();
            self::back(__('Marked as seen. It stays on the card in a calm colour for a week.', 'dcc-ragusa'), 'good');
        }
        self::back(__('That finding is not open, so there is nothing to mark.', 'dcc-ragusa'), 'warn');
    }

    // --------------------------------------------------------- view data

    /** Housekeeping lines: leftover cron hooks and folders, info only. */
    public static function housekeeping(): array
    {
        $lines = [];
        $hooks = ['smart_online_order_update_jwttoken', 'check_plugin_updates-siteseo', 'eb_pattern_update_cron'];
        $cron  = function_exists('_get_cron_array') ? (array) _get_cron_array() : [];
        $found = [];
        foreach ($cron as $events) {
            foreach ((array) $events as $hook => $x) {
                if (in_array($hook, $hooks, true)) {
                    $found[$hook] = true;
                }
            }
        }
        if ($found !== []) {
            /* translators: %s: hook names */
            $lines[] = sprintf(__('Leftover cron hooks from removed plugins: %s. Harmless; WP Crontrol can remove them.', 'dcc-ragusa'), implode(', ', array_keys($found)));
        }
        $up = Site::uploads_dir();
        $leftovers = [];
        foreach (['wp-file-manager-pro/fm_backup', 'wc-logs', 'woocommerce_uploads', 'woocommerce_transient_files', 'evf-logs', 'astra-sites', 'wpsc'] as $dir) {
            if (is_dir($up . '/' . $dir)) {
                $leftovers[] = 'uploads/' . $dir;
            }
        }
        if ($leftovers !== []) {
            /* translators: %s: folders */
            $lines[] = sprintf(__('Leftover folders of removed plugins: %s. The fm_backup one carries a malformed .htaccess and answers 500. Harmless; the site director can remove them.', 'dcc-ragusa'), implode(', ', $leftovers));
        }
        return $lines;
    }

    public static function standing_advice(): array
    {
        return [
            __('The /staff/ password is weak. Change it to a long passphrase.', 'dcc-ragusa'),
            __('The security salts in wp-config.php have never been rotated. The site director can rotate them; everyone is logged out once.', 'dcc-ragusa'),
            __('There is no two-factor login. Jetpack offers it for WordPress.com-connected accounts.', 'dcc-ragusa'),
            __('Four API keys sit in plain text in the options table: connectors_ai_openai_api_key, connectors_ai_anthropic_api_key, connectors_ai_google_api_key and dccgg_gemini_key. Ragusa never reads their values.', 'dcc-ragusa'),
        ];
    }

    public static function zelenci_installed(): bool
    {
        return is_file(Site::mu_dir() . '/dcc-ragusa-zelenci.php');
    }
}
