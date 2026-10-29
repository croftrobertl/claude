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

    /**
     * Every POST this plugin accepts.
     *
     * Kept as one list so the test suite can walk it: each one must have a
     * handler, and each handler must refuse both a visitor without
     * manage_options and a bad nonce. Adding an action without its guards is
     * then a failing test rather than a hole.
     */
    public const ACTIONS = [
        'import', 'link', 'manual_link', 'unlink', 'review', 'undo',
        'settings', 'export', 'snapshot', 'adjust', 'unadjust',
        'confirm_move', 'reject_move', 'reverse_assumed', 'remove_bad_links',
        'record_refund',
    ];

    public static function register_actions(): void
    {
        foreach (self::ACTIONS as $action) {
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
     * @return array{from:string,to:string,label:string,kind:string,basis:string,view:string}
     */
    public static function current_period(): array
    {
        $kind  = isset($_GET['period']) ? sanitize_key(wp_unslash($_GET['period'])) : 'month';
        $value = isset($_GET['value']) ? sanitize_text_field(wp_unslash($_GET['value'])) : '';
        $from  = isset($_GET['from']) ? sanitize_text_field(wp_unslash($_GET['from'])) : '';
        $to    = isset($_GET['to']) ? sanitize_text_field(wp_unslash($_GET['to'])) : '';
        $basis = (isset($_GET['basis']) && $_GET['basis'] === 'payout') ? 'payout' : 'stay';
        $view  = isset($_GET['view']) ? sanitize_key(wp_unslash($_GET['view'])) : 'ledger';

        $period = Reports::period($kind, $value, $from, $to);
        $period['basis'] = $basis;
        $period['view']  = in_array($view, Reports::VIEWS, true) ? $view : 'ledger';
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
        // A missing MotoPress key must never show up as a figure of zero.
        $health = Health::banner();

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

        $skipped_detail = [];
        if (($counts['skipped_payout_rows'] ?? 0) > 0) {
            $skipped_detail[] = sprintf(
                /* translators: %d: number of payout separator rows */
                __('%d payout separator rows, which are not reservations', 'dcc-ledger'),
                (int) $counts['skipped_payout_rows']
            );
        }
        if (($counts['skipped_no_code'] ?? 0) > 0) {
            $skipped_detail[] = sprintf(
                /* translators: %d: number of rows with no confirmation code */
                __('%d rows with no confirmation code, which never became a stay', 'dcc-ledger'),
                (int) $counts['skipped_no_code']
            );
        }

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

        if ($skipped_detail !== []) {
            $message .= ' ' . sprintf(
                /* translators: %s: a list describing what was skipped */
                __('Of the skipped rows: %s.', 'dcc-ledger'),
                implode('; ', $skipped_detail)
            );
        }

        self::back('imports', $message);
    }

    /**
     * Copy MotoPress into the ledger, or refresh an earlier copy.
     *
     * A refresh adds what is new, records what changed as a new version beside
     * the old one, and never touches a correction the ledger already holds.
     */
    public static function handle_snapshot(): void
    {
        self::guard();

        $dry    = !empty($_POST['dry_run']);
        $result = Snapshot::run($dry, get_current_user_id());

        if (!$result['ok']) {
            self::back('imports', $result['message'], 'error');
        }

        $c = $result['counts'];
        self::back('imports', sprintf(
            /* translators: 1: dry run or snapshot, 2: bookings read, 3: new, 4: changed, 5: payments copied, 6: assumed count, 7: assumed total */
            __('%1$s: %2$d bookings read, %3$d newly copied, %4$d changed since last time, %5$d payments copied, %6$d assumed payments totalling %7$s.', 'dcc-ledger'),
            $result['dry_run'] ? __('Dry run', 'dcc-ledger') : __('Snapshot', 'dcc-ledger'),
            (int) $c['bookings_read'],
            (int) $c['bookings_new'],
            (int) $c['bookings_changed'],
            (int) ($c['payments_new'] + $c['payments_changed']),
            (int) $c['assumed_bookings'],
            '$' . number_format((float) $c['assumed_total'], 2)
        ));
    }

    /** A correction by hand, on top of the Original, never instead of it. */
    public static function handle_adjust(): void
    {
        self::guard();

        $booking_id = isset($_POST['booking_id']) ? (int) $_POST['booking_id'] : 0;
        // Parsed from the posted text, so "19.99" is 1999 cents exactly.
        $cents      = isset($_POST['amount']) ? Money::to_cents(wp_unslash($_POST['amount'])) : 0;
        $note       = isset($_POST['note']) ? sanitize_text_field(wp_unslash($_POST['note'])) : '';
        $date       = isset($_POST['event_date']) ? sanitize_text_field(wp_unslash($_POST['event_date'])) : '';

        if ($booking_id <= 0) {
            self::back('cleanup', __('A booking id is needed.', 'dcc-ledger'), 'error');
        }

        $original = Originals::current(Originals::KIND_BOOKING, $booking_id);
        if ($original === null) {
            self::back('cleanup', __('That booking has not been copied into the ledger yet. Refresh from MotoPress first.', 'dcc-ledger'), 'error');
        }

        Adjustments::add([
            'type'            => Adjustments::MANUAL,
            'mphb_booking_id' => $booking_id,
            'cottage'         => (string) $original['cottage'],
            'amount_cents'    => $cents,
            'event_date'      => Dates::is_valid($date) ? $date : (string) $original['check_in'],
            'label'           => Adjustments::label_for(Adjustments::MANUAL),
            'note'            => $note,
        ], null, get_current_user_id());

        self::back('cleanup', __('Correction recorded on top of the original.', 'dcc-ledger'));
    }

    public static function handle_unadjust(): void
    {
        self::guard();
        $id = isset($_POST['adjustment_id']) ? (int) $_POST['adjustment_id'] : 0;
        if ($id <= 0 || !Adjustments::remove($id)) {
            self::back('cleanup', __('That correction could not be removed.', 'dcc-ledger'), 'error');
        }
        self::back('cleanup', __('Correction removed. The original is untouched, as it always was.', 'dcc-ledger'));
    }

    /** Rob agrees: the guest was moved, and this is the same stay. */
    public static function handle_confirm_move(): void
    {
        self::guard();

        $booking_id = isset($_POST['booking_id']) ? (int) $_POST['booking_id'] : 0;
        $stay_id    = isset($_POST['stay_id']) ? (int) $_POST['stay_id'] : 0;

        if ($booking_id <= 0 || $stay_id <= 0) {
            self::back('cleanup', __('A booking and a stay are both needed.', 'dcc-ledger'), 'error');
        }

        Repo::link($stay_id, $booking_id, 'copy', get_current_user_id());
        Repo::mark_reviewed(
            'move_copy:' . $booking_id . ':' . $stay_id,
            __('Confirmed as a move.', 'dcc-ledger'),
            get_current_user_id()
        );

        self::back('cleanup', __('Move confirmed. The stay is counted once, on the platform stay.', 'dcc-ledger'));
    }

    /** Rob disagrees: these are two different stays. */
    public static function handle_reject_move(): void
    {
        self::guard();

        $booking_id = isset($_POST['booking_id']) ? (int) $_POST['booking_id'] : 0;
        $stay_id    = isset($_POST['stay_id']) ? (int) $_POST['stay_id'] : 0;
        $note       = isset($_POST['note']) ? sanitize_text_field(wp_unslash($_POST['note'])) : '';

        if ($booking_id <= 0 || $stay_id <= 0) {
            self::back('cleanup', __('A booking and a stay are both needed.', 'dcc-ledger'), 'error');
        }

        Decisions::reject_move($booking_id, $stay_id, $note, get_current_user_id());

        self::back('cleanup', __('Recorded as a separate stay. It will be counted on its own from now on, and it will not be asked about again.', 'dcc-ledger'));
    }

    /**
     * Cancel an assumed payment that turned out to sit on a copy.
     *
     * The assumption is never deleted: a second, labelled adjustment reverses
     * it, so the record keeps both halves.
     */
    public static function handle_reverse_assumed(): void
    {
        self::guard();

        $booking_id = isset($_POST['booking_id']) ? (int) $_POST['booking_id'] : 0;
        $assumed    = $booking_id > 0 ? Adjustments::assumed_for($booking_id) : null;

        if ($assumed === null) {
            self::back('cleanup', __('That booking has no assumed payment standing against it.', 'dcc-ledger'), 'error');
        }

        Adjustments::add([
            'type'            => Adjustments::ASSUMED_REVERSAL,
            'mphb_booking_id' => $booking_id,
            'cottage'         => (string) $assumed['cottage'],
            'amount_cents'    => -1 * (int) $assumed['amount_cents'],
            'event_date'      => (string) $assumed['event_date'],
            'label'           => Adjustments::label_for(Adjustments::ASSUMED_REVERSAL),
            'note'            => (string) $assumed['type'] === Adjustments::ASSUMED_PRE_EXPORTS
                ? __('The assumption that this booking was paid before the exports begin is cancelled, not removed. Both halves stay on the record.', 'dcc-ledger')
                : __('The assumed payment above is cancelled, not removed. Both halves stay on the record, so the pair nets to nothing.', 'dcc-ledger'),
        ], null, get_current_user_id());

        self::back('cleanup', __('Assumed payment reversed. Both the assumption and its reversal stay on the record.', 'dcc-ledger'));
    }

    /**
     * Record a refund MotoPress never saw.
     *
     * The card processor refunded the guest and nobody told MotoPress, so
     * the booking reads as overpaid. The refund is a labelled adjustment on
     * top of the frozen Original, like every other correction — the payment
     * in MotoPress is not touched, and neither is the Original.
     */
    public static function handle_record_refund(): void
    {
        self::guard();

        $booking_id = isset($_POST['booking_id']) ? (int) $_POST['booking_id'] : 0;
        $cents      = isset($_POST['amount']) ? Money::to_cents(wp_unslash($_POST['amount'])) : 0;

        if ($booking_id <= 0 || $cents <= 0) {
            self::back('cleanup', __('A booking and an amount above zero are both needed.', 'dcc-ledger'), 'error');
        }
        if (Adjustments::refund_for($booking_id) !== null) {
            self::back('cleanup', __('That booking already has a refund recorded against it.', 'dcc-ledger'), 'error');
        }

        $booking = Originals::current(Originals::KIND_BOOKING, $booking_id);
        if ($booking === null) {
            self::back('cleanup', __('That booking has not been copied into the ledger yet. Refresh from MotoPress first.', 'dcc-ledger'), 'error');
        }

        Adjustments::add([
            'type'            => Adjustments::REFUND_UNRECORDED,
            'channel'         => 'direct',
            'mphb_booking_id' => $booking_id,
            'cottage'         => (string) ($booking['cottage'] ?? ''),
            'amount_cents'    => -1 * $cents,
            'event_date'      => (string) ($booking['check_out'] ?: $booking['check_in']),
            'label'           => Adjustments::label_for(Adjustments::REFUND_UNRECORDED),
            'note'            => __('Recorded by hand: the card processor refunded this and MotoPress was never told. Dated at check-out.', 'dcc-ledger'),
        ], null, get_current_user_id());

        Reports::flush_cache();

        self::back('cleanup', __('Refund recorded. MotoPress is unchanged; the ledger carries the correction.', 'dcc-ledger'));
    }

    /**
     * Remove links pointing at a stay that does not exist, as a recorded,
     * undoable batch. Never a silent delete.
     */
    public static function handle_remove_bad_links(): void
    {
        self::guard();

        $result = Repair::remove_bad_links(get_current_user_id());

        if ($result['removed'] === 0) {
            self::back('cleanup', __('There were none to remove.', 'dcc-ledger'), 'error');
        }

        self::back('cleanup', sprintf(
            /* translators: 1: number of links removed, 2: batch id */
            __('Removed %1$d link rows that pointed at no stay, as batch %2$d. Undo it on the Imports tab if that was wrong.', 'dcc-ledger'),
            (int) $result['removed'],
            (int) $result['batch_id']
        ));
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

    /**
     * Link a stay to a booking somebody typed the number of.
     *
     * A number typed by hand is the one place a wrong link can be made in a
     * single keystroke, so every check is made before the link is written:
     * the booking has to exist, be confirmed, and be in the same cottage as
     * the stay. A link to the wrong cottage would move a stay's money onto
     * somebody else's nights and nothing afterwards would notice.
     */
    public static function handle_manual_link(): void
    {
        self::guard();
        $stay_id = isset($_POST['stay_id']) ? (int) $_POST['stay_id'] : 0;
        $booking = isset($_POST['booking_id']) ? (int) $_POST['booking_id'] : 0;
        $method  = (isset($_POST['method']) && $_POST['method'] === 'copy') ? 'copy' : 'manual';
        $key     = isset($_POST['issue_key']) ? sanitize_text_field(wp_unslash($_POST['issue_key'])) : '';

        if ($stay_id <= 0 || $booking <= 0) {
            self::back('cleanup', __('A stay and a booking id are both needed.', 'dcc-ledger'), 'error');
        }

        $problem = Linker::why_not_linkable($stay_id, $booking);
        if ($problem !== null) {
            self::back('cleanup', $problem, 'error');
        }

        if (!Repo::link($stay_id, $booking, $method, get_current_user_id())) {
            self::back('cleanup', __('That link could not be made — the stay may already have one.', 'dcc-ledger'), 'error');
        }

        // The person answered the question by linking it, so the item it was
        // asked on comes off the list with them.
        if ($key !== '') {
            Repo::mark_reviewed(
                $key,
                sprintf(
                    /* translators: 1: booking id, 2: how it was linked */
                    __('Linked by hand to MotoPress booking #%1$d (%2$s).', 'dcc-ledger'),
                    $booking,
                    $method === 'copy' ? __('as a copy', 'dcc-ledger') : __('as its imported booking', 'dcc-ledger')
                ),
                get_current_user_id()
            );
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
