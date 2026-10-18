<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The wp-admin screens and the actions behind them.
 *
 * Every screen and every action checks manage_options, and every POST checks a
 * nonce. There are no REST routes and no front-end output.
 */
final class Admin
{
    public const CAP      = 'manage_options';
    public const SLUG     = 'dcc-ledger';
    public const PARENT   = 'dcc';
    public const NONCE    = 'dccl_action';

    public const TABS = ['overview', 'cottage', 'channel', 'stays', 'cleanup', 'imports', 'settings'];

    public static function tab_labels(): array
    {
        return [
            'overview' => __('Overview', 'dcc-ledger'),
            'cottage'  => __('By Cottage', 'dcc-ledger'),
            'channel'  => __('By Channel', 'dcc-ledger'),
            'stays'    => __('Stays', 'dcc-ledger'),
            'cleanup'  => __('Cleanup', 'dcc-ledger'),
            'imports'  => __('Imports', 'dcc-ledger'),
            'settings' => __('Settings', 'dcc-ledger'),
        ];
    }

    public static function register_menu(): void
    {
        global $admin_page_hooks;

        // The other DCC admin tools share one "DCC" menu. Create it only if
        // none of them has already.
        if (!isset($admin_page_hooks[self::PARENT])) {
            add_menu_page(
                __('DCC', 'dcc-ledger'),
                __('DCC', 'dcc-ledger'),
                self::CAP,
                self::PARENT,
                ['\\DCCL\\Admin', 'render'],
                'dashicons-chart-area',
                58
            );
        }

        add_submenu_page(
            self::PARENT,
            __('Ledger', 'dcc-ledger'),
            __('Ledger', 'dcc-ledger'),
            self::CAP,
            self::SLUG,
            ['\\DCCL\\Admin', 'render']
        );
    }

    public static function enqueue(string $hook): void
    {
        if (!str_contains($hook, self::SLUG)) {
            return;
        }
        wp_enqueue_style('dccl-admin', DCCL_URL . 'assets/css/admin.css', [], DCCL_VERSION);
        wp_enqueue_script('dccl-admin', DCCL_URL . 'assets/js/admin.js', [], DCCL_VERSION, true);
    }

    public static function register_actions(): void
    {
        foreach (['import', 'link', 'manual_link', 'unlink', 'review', 'undo', 'settings', 'export'] as $action) {
            add_action('admin_post_dccl_' . $action, ['\\DCCL\\Admin', 'handle_' . $action]);
        }
    }

    // ------------------------------------------------------------- render

    public static function current_tab(): string
    {
        $tab = isset($_GET['tab']) ? sanitize_key(wp_unslash($_GET['tab'])) : 'overview';
        return in_array($tab, self::TABS, true) ? $tab : 'overview';
    }

    /**
     * @return array{from:string,to:string,label:string,kind:string,basis:string}
     */
    public static function current_period(): array
    {
        $kind  = isset($_GET['period']) ? sanitize_key(wp_unslash($_GET['period'])) : 'month';
        $value = isset($_GET['value']) ? sanitize_text_field(wp_unslash($_GET['value'])) : '';
        $from  = isset($_GET['from']) ? sanitize_text_field(wp_unslash($_GET['from'])) : '';
        $to    = isset($_GET['to']) ? sanitize_text_field(wp_unslash($_GET['to'])) : '';
        $basis = (isset($_GET['basis']) && $_GET['basis'] === 'payout') ? 'payout' : 'stay';

        $period = Reports::period($kind, $value, $from, $to);
        $period['basis'] = $basis;
        return $period;
    }

    public static function render(): void
    {
        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__('You do not have permission to view the ledger.', 'dcc-ledger'));
        }

        $tab    = self::current_tab();
        $period = self::current_period();
        $notice = self::notice();

        include DCCL_DIR . 'includes/admin/views/page.php';
    }

    /** @return array{type:string,text:string}|null */
    private static function notice(): ?array
    {
        if (!isset($_GET['dccl_notice'])) {
            return null;
        }
        $text = sanitize_text_field(wp_unslash($_GET['dccl_notice']));
        $type = isset($_GET['dccl_type']) && $_GET['dccl_type'] === 'error' ? 'error' : 'success';
        return $text === '' ? null : ['type' => $type, 'text' => $text];
    }

    public static function url(array $args = []): string
    {
        return add_query_arg(
            array_merge(['page' => self::SLUG], $args),
            admin_url('admin.php')
        );
    }

    private static function guard(): void
    {
        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__('You do not have permission to do that.', 'dcc-ledger'), '', ['response' => 403]);
        }
        check_admin_referer(self::NONCE);
    }

    private static function back(string $tab, string $message, string $type = 'success'): void
    {
        wp_safe_redirect(self::url([
            'tab'         => $tab,
            'dccl_notice' => $message,
            'dccl_type'   => $type,
        ]));
        exit;
    }

    // ------------------------------------------------------------ actions

    /**
     * Upload and import. The file is moved to a private temp file, parsed, and
     * deleted before the request ends — on success and on failure alike. It is
     * never written into uploads/.
     */
    public static function handle_import(): void
    {
        self::guard();

        $dry  = !empty($_POST['dry_run']);
        $file = $_FILES['ledger_file'] ?? null;

        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            self::back('imports', __('No file was uploaded.', 'dcc-ledger'), 'error');
        }
        if ((int) $file['size'] > Csv::MAX_BYTES) {
            self::back('imports', __('That file is larger than the 5 MB limit.', 'dcc-ledger'), 'error');
        }

        $label = sanitize_file_name((string) $file['name']);
        if (!str_ends_with(strtolower($label), '.csv')) {
            self::back('imports', __('Only .csv files can be imported.', 'dcc-ledger'), 'error');
        }

        $temp = wp_tempnam('dccl');
        // Belt and braces: even a fatal error later in the request removes it.
        register_shutdown_function(static function () use ($temp): void {
            if (file_exists($temp)) {
                @unlink($temp);
            }
        });

        try {
            if (!@move_uploaded_file((string) $file['tmp_name'], $temp)
                && !@copy((string) $file['tmp_name'], $temp)) {
                self::back('imports', __('The uploaded file could not be read.', 'dcc-ledger'), 'error');
            }

            $result = Importer::run($temp, $label, $dry, get_current_user_id());
        } finally {
            if (file_exists($temp)) {
                @unlink($temp);
            }
        }

        if (!$result['ok']) {
            self::back('imports', $result['message'], 'error');
        }

        $counts = $result['counts'];
        $message = sprintf(
            /* translators: 1: dry run or import, 2: rows read, 3: new stays, 4: new money lines, 5: unchanged, 6: excluded, 7: skipped */
            __('%1$s: %2$d rows read, %3$d new stays, %4$d new money lines, %5$d already there, %6$d Crofty Bear rows excluded, %7$d skipped.', 'dcc-ledger'),
            $result['dry_run'] ? __('Dry run', 'dcc-ledger') : __('Imported', 'dcc-ledger'),
            $counts['read'],
            $counts['stays_new'],
            $counts['lines_new'],
            $counts['stays_unchanged'] + $counts['lines_unchanged'],
            $counts['excluded'],
            $counts['skipped'] + $counts['malformed'] + $counts['unknown_cottage']
        );

        self::back('imports', $message);
    }

    public static function handle_link(): void
    {
        self::guard();
        $counts = Linker::run(get_current_user_id());
        self::back('cleanup', sprintf(
            /* translators: 1: links by code, 2: exact links, 3: copy links, 4: stays left unlinked */
            __('Linked %1$d by code, %2$d by exact dates, %3$d hand-typed copies. %4$d stays still need a person.', 'dcc-ledger'),
            $counts['code'],
            $counts['exact'],
            $counts['copy'],
            $counts['skipped']
        ));
    }

    public static function handle_manual_link(): void
    {
        self::guard();
        $stay_id = isset($_POST['stay_id']) ? (int) $_POST['stay_id'] : 0;
        $booking = isset($_POST['booking_id']) ? (int) $_POST['booking_id'] : 0;
        $method  = (isset($_POST['method']) && $_POST['method'] === 'copy') ? 'copy' : 'manual';

        if ($stay_id <= 0 || $booking <= 0) {
            self::back('cleanup', __('A stay and a booking id are both needed.', 'dcc-ledger'), 'error');
        }
        if (!Repo::link($stay_id, $booking, $method, get_current_user_id())) {
            self::back('cleanup', __('That link could not be made — the stay may already have one.', 'dcc-ledger'), 'error');
        }
        self::back('cleanup', __('Linked.', 'dcc-ledger'));
    }

    public static function handle_unlink(): void
    {
        self::guard();
        $link_id = isset($_POST['link_id']) ? (int) $_POST['link_id'] : 0;
        if ($link_id <= 0 || !Repo::unlink($link_id)) {
            self::back('cleanup', __('That link could not be removed.', 'dcc-ledger'), 'error');
        }
        self::back('cleanup', __('Link removed.', 'dcc-ledger'));
    }

    public static function handle_review(): void
    {
        self::guard();
        $key  = isset($_POST['issue_key']) ? sanitize_text_field(wp_unslash($_POST['issue_key'])) : '';
        $note = isset($_POST['note']) ? sanitize_text_field(wp_unslash($_POST['note'])) : '';

        if ($key === '') {
            self::back('cleanup', __('That item could not be found.', 'dcc-ledger'), 'error');
        }
        if (!empty($_POST['undo_review'])) {
            Repo::unmark_reviewed($key);
            self::back('cleanup', __('Put back on the list.', 'dcc-ledger'));
        }
        Repo::mark_reviewed($key, mb_substr($note, 0, 500), get_current_user_id());
        self::back('cleanup', __('Marked as reviewed.', 'dcc-ledger'));
    }

    public static function handle_undo(): void
    {
        self::guard();
        $batch = isset($_POST['batch_id']) ? (int) $_POST['batch_id'] : 0;
        $out   = Batches::undo($batch);
        self::back('imports', $out['message'], $out['ok'] ? 'success' : 'error');
    }

    public static function handle_settings(): void
    {
        self::guard();

        $maps = [];
        foreach (['bookingcom', 'vrbo'] as $channel) {
            $raw = $_POST['map'][$channel] ?? [];
            if (!is_array($raw)) {
                continue;
            }
            foreach ($raw as $id => $cottage) {
                $maps[$channel][sanitize_text_field((string) $id)] = sanitize_text_field((string) $cottage);
            }
        }
        Settings::save_maps($maps);
        Settings::set_delete_data_on_uninstall(!empty($_POST['delete_on_uninstall']));

        self::back('settings', __('Settings saved.', 'dcc-ledger'));
    }

    /** CSV download of whichever table the tab is showing. */
    public static function handle_export(): void
    {
        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__('You do not have permission to do that.', 'dcc-ledger'), '', ['response' => 403]);
        }
        check_admin_referer(self::NONCE);

        $what   = isset($_GET['what']) ? sanitize_key(wp_unslash($_GET['what'])) : 'stays';
        $period = self::current_period();
        $rows   = Export::rows($what, $period);

        nocache_headers();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=dcc-ledger-' . $what . '-' . $period['from'] . '-to-' . $period['to'] . '.csv');

        $out = fopen('php://output', 'w');
        foreach ($rows as $row) {
            fputcsv($out, $row, ',', '"', '');
        }
        fclose($out);
        exit;
    }
}
