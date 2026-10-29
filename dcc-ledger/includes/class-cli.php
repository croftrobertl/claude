<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP-CLI commands, for running imports over SSH.
 *
 *     wp dcc-ledger import <file> [--dry-run]
 *     wp dcc-ledger batches
 *     wp dcc-ledger undo <batch>
 *     wp dcc-ledger link
 *     wp dcc-ledger cleanup
 */
final class Cli
{
    /**
     * Subcommands whose method name is not the name a person types.
     *
     * WP-CLI derives a subcommand from its method, so money_check answered
     * to the underscore while the checklist and the rollback notes both said
     * money-check. Registered explicitly here, with the underscore kept as
     * an alias so anything already written down keeps working.
     *
     * hyphenated name => method
     */
    public const HYPHENATED = [
        'money-check'    => 'money_check',
        'money-rollback' => 'money_rollback',
    ];

    /**
     * Import a platform export.
     *
     * ## OPTIONS
     *
     * <file>
     * : Path to the .csv export.
     *
     * [--dry-run]
     * : Report the counts and write nothing.
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function import(array $args, array $assoc): void
    {
        $path = $args[0] ?? '';
        if ($path === '' || !is_readable($path)) {
            \WP_CLI::error(__('That file could not be read.', 'dcc-ledger'));
        }

        $dry    = isset($assoc['dry-run']);
        $result = Importer::run($path, basename($path), $dry, get_current_user_id() ?: null);

        if (!$result['ok']) {
            \WP_CLI::error($result['message']);
        }

        $c = $result['counts'];
        \WP_CLI::log(sprintf('Format:          %s', $result['kind']));
        \WP_CLI::log(sprintf('Rows read:       %d', $c['read']));
        \WP_CLI::log(sprintf('New stays:       %d', $c['stays_new']));
        \WP_CLI::log(sprintf('Stays filled in: %d', $c['stays_enriched']));
        \WP_CLI::log(sprintf('Stays unchanged: %d', $c['stays_unchanged']));
        \WP_CLI::log(sprintf('New money lines: %d', $c['lines_new']));
        \WP_CLI::log(sprintf('Lines unchanged: %d', $c['lines_unchanged']));
        \WP_CLI::log(sprintf('Crofty excluded: %d', $c['excluded']));
        \WP_CLI::log(sprintf('Unknown cottage: %d', $c['unknown_cottage']));
        \WP_CLI::log(sprintf('Malformed:       %d', $c['malformed']));
        \WP_CLI::log(sprintf('Skipped:         %d', $c['skipped']));

        // "Skipped" on its own says nothing useful, so it is broken out.
        if (($c['skipped_payout_rows'] ?? 0) > 0) {
            \WP_CLI::log(sprintf(
                '  of which payout separator rows: %d  (Airbnb interleaves these between payout groups; they are not reservations)',
                $c['skipped_payout_rows']
            ));
        }
        if (($c['skipped_no_code'] ?? 0) > 0) {
            \WP_CLI::log(sprintf(
                '  of which rows with no confirmation code: %d  (an enquiry or a request never accepted; no stay to record)',
                $c['skipped_no_code']
            ));
        }
        if (($c['skipped_blank'] ?? 0) > 0) {
            \WP_CLI::log(sprintf('  of which blank rows: %d', $c['skipped_blank']));
        }

        foreach ($result['notes'] as $note) {
            \WP_CLI::warning($note);
        }

        if ($result['dry_run']) {
            \WP_CLI::success(__('Dry run complete. Nothing was written.', 'dcc-ledger'));
            return;
        }

        \WP_CLI::success(sprintf('Imported as batch %d.', (int) $result['batch_id']));
    }

    /**
     * Copy MotoPress into the ledger, or refresh an earlier copy.
     *
     * Adds what is new, records what changed as a new version beside the old
     * one, and never touches a correction the ledger already holds. MotoPress
     * itself is only ever read.
     *
     * ## OPTIONS
     *
     * [--dry-run]
     * : Report the counts and write nothing.
     *
     * [--verbose]
     * : Also list the MotoPress booking ids that were skipped as copies, and
     *   the ones offered as probable moves. Ids only — no guest data.
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function snapshot(array $args, array $assoc): void
    {
        $dry     = isset($assoc['dry-run']);
        $verbose = isset($assoc['verbose']);
        $result = Snapshot::run($dry, get_current_user_id() ?: null);

        if (!$result['ok']) {
            \WP_CLI::error($result['message']);
        }

        $c = $result['counts'];
        \WP_CLI::log(sprintf('Bookings read:        %d', $c['bookings_read']));
        \WP_CLI::log(sprintf('Newly copied:         %d', $c['bookings_new']));
        \WP_CLI::log(sprintf('Changed since copied: %d', $c['bookings_changed']));
        \WP_CLI::log(sprintf('Unchanged:            %d', $c['bookings_unchanged']));
        \WP_CLI::log(sprintf('Payments copied:      %d', $c['payments_new'] + $c['payments_changed']));
        \WP_CLI::log('');
        \WP_CLI::log(sprintf('Assumed payments:     %d bookings', $c['assumed_bookings']));
        \WP_CLI::log(sprintf('Assumed total:        $%s', number_format(((int) $c['assumed_total']) / 100, 2)));
        // Rob's two rulings, printed apart from the window rule's figures
        // because they are a list he named, not a rule worked out here.
        \WP_CLI::log(sprintf(
            'Assumed pre-exports:  %d bookings, $%s',
            $c['assumed_pre_exports'],
            number_format(((int) $c['assumed_pre_exports_total']) / 100, 2)
        ));
        \WP_CLI::log(sprintf(
            'Refunds recorded:     %d bookings, $%s',
            $c['refunds_recorded'],
            number_format(((int) $c['refunds_total']) / 100, 2)
        ));
        \WP_CLI::log(sprintf('Skipped, a copy:      %d', $c['copies_skipped']));
        \WP_CLI::log(sprintf(
            '  by an existing link: %d · by a code in a note: %d · by cottage and dates: %d',
            $c['copies_by_link'],
            $c['copies_by_code'],
            $c['copies_by_dates']
        ));
        \WP_CLI::log(sprintf(
            '  (%d copies in all; the rest fall outside the window or are not confirmed bookings)',
            $c['copies_detected']
        ));
        \WP_CLI::log(sprintf(
            'Probable moves:       %d, of which %d have no name to compare',
            $c['probable_moves'],
            $c['moves_unnamed']
        ));
        \WP_CLI::log('  These count as real stays until confirmed on the Cleanup tab.');
        \WP_CLI::log(sprintf('Skipped, overpaid:    %d', $c['overpaid_skipped']));
        \WP_CLI::log(sprintf('Outside the window:   %d', $c['outside_window']));
        \WP_CLI::log(sprintf('Already adjusted:     %d', $c['assumed_existing']));

        foreach ($result['notes'] as $note) {
            \WP_CLI::warning($note);
        }

        if ($verbose) {
            \WP_CLI::log('');
            \WP_CLI::log(sprintf(
                'Skipped as copies (booking ids): %s',
                $c['copy_ids'] === [] ? 'none' : implode(', ', $c['copy_ids'])
            ));
            \WP_CLI::log(sprintf(
                'Offered as probable moves (booking ids): %s',
                $c['move_ids'] === [] ? 'none' : implode(', ', $c['move_ids'])
            ));
        }

        if (($c['assumed_withheld'] ?? 0) > 0) {
            \WP_CLI::warning(__('No assumed payments were written. Import the platform reservations exports first.', 'dcc-ledger'));
        }

        if ($result['dry_run']) {
            \WP_CLI::success(__('Dry run complete. Nothing was written.', 'dcc-ledger'));
            return;
        }

        \WP_CLI::success(sprintf('Snapshot taken as batch %d.', (int) $result['batch_id']));
    }

    /**
     * List import batches.
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function batches(array $args, array $assoc): void
    {
        $rows = [];
        foreach (Batches::all(200) as $batch) {
            $rows[] = [
                'id'        => (int) $batch['id'],
                'kind'      => (string) $batch['kind'],
                'file'      => (string) $batch['label'],
                'read'      => (int) $batch['rows_read'],
                'added'     => (int) $batch['rows_inserted'],
                'unchanged' => (int) $batch['rows_unchanged'],
                'excluded'  => (int) $batch['rows_excluded'],
                'skipped'   => (int) $batch['rows_skipped'],
                'when'      => (string) $batch['created_at'],
                'undone'    => Batches::is_undone($batch) ? 'yes' : 'no',
            ];
        }

        if ($rows === []) {
            \WP_CLI::log(__('Nothing imported yet.', 'dcc-ledger'));
            return;
        }

        \WP_CLI\Utils\format_items('table', $rows, array_keys($rows[0]));
    }

    /**
     * Undo an import batch.
     *
     * ## OPTIONS
     *
     * <batch>
     * : The batch id, as shown by `wp dcc-ledger batches`.
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function undo(array $args, array $assoc): void
    {
        $batch_id = (int) ($args[0] ?? 0);
        $result   = Batches::undo($batch_id);
        if (!$result['ok']) {
            \WP_CLI::error($result['message']);
        }
        \WP_CLI::success($result['message']);
    }

    /**
     * Match stays to MotoPress bookings. Reads MotoPress; writes only links.
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function link(array $args, array $assoc): void
    {
        $counts = Linker::run(get_current_user_id() ?: null);
        \WP_CLI::log(sprintf('Linked by code:        %d', $counts['code']));
        \WP_CLI::log(sprintf('Linked by exact dates: %d', $counts['exact']));
        \WP_CLI::log(sprintf('Hand-typed copies:     %d', $counts['copy']));
        \WP_CLI::log(sprintf('Left for a person:     %d', $counts['skipped']));
        \WP_CLI::success(__('Matching complete.', 'dcc-ledger'));
    }

    /**
     * Check that every stored figure is in whole cents, and that the cents
     * agree with the decimals they were converted from.
     *
     * ## OPTIONS
     *
     * [--dry-run]
     * : Report what would be converted and write nothing.
     *
     * @subcommand money-check
     * @alias money_check
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function money_check(array $args, array $assoc): void
    {
        $result = Money_Migration::run(isset($assoc['dry-run']));

        \WP_CLI::log($result['message']);
        foreach ($result['checks'] as $check) {
            \WP_CLI::log(sprintf(
                '  %s %-18s %s',
                $check['ok'] ? 'OK  ' : '!!  ',
                $check['what'],
                $check['detail']
            ));
        }

        $unconverted = Health::money_not_in_cents();
        \WP_CLI::log(sprintf('Rows still holding a decimal and no cents: %d', $unconverted));

        if (!$result['ok'] || $unconverted > 0) {
            \WP_CLI::error(__('The money is not in the state the ledger expects.', 'dcc-ledger'));
        }

        \WP_CLI::success(__('Every stored figure is in whole cents, and every total ties.', 'dcc-ledger'));
    }

    /**
     * Put the decimal money columns back exactly as they were before the
     * conversion to cents, and stop reading cents.
     *
     * The one-line way back out of 0.2.0. Afterwards the ledger refuses to
     * report figures — it says so in a banner — until either this command's
     * opposite (`wp dcc-ledger money-check`) is run or 0.1.9 is reinstalled.
     *
     * @subcommand money-rollback
     * @alias money_rollback
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function money_rollback(array $args, array $assoc): void
    {
        $result = Money_Migration::rollback();

        \WP_CLI::log(sprintf('Cells restored: %d', $result['restored']));
        \WP_CLI::log($result['message']);
        \WP_CLI::warning(__('The ledger will not report figures until the money is converted again or 0.1.9 is reinstalled. This is deliberate: reading cents that are no longer there would report every figure as zero.', 'dcc-ledger'));
    }

    /**
     * Print the cleanup list.
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function cleanup(array $args, array $assoc): void
    {
        // Information items are not work. Counting them among the rest said
        // "28 items need a person" on live when 13 of them needed nobody.
        $needs_a_person = [];
        $information    = [];
        foreach (Issues::open() as $item) {
            if ((string) ($item['severity'] ?? '') === 'info') {
                $information[] = $item;
            } else {
                $needs_a_person[] = $item;
            }
        }

        $print = static function (array $item): void {
            \WP_CLI::log('');
            \WP_CLI::log($item['title'] . '  [' . $item['key'] . ']');
            foreach ($item['facts'] as $fact) {
                \WP_CLI::log('  - ' . $fact);
            }
            \WP_CLI::log('  → ' . $item['action']);
        };

        foreach ($needs_a_person as $item) {
            $print($item);
        }

        if ($information !== []) {
            \WP_CLI::log('');
            \WP_CLI::log(sprintf('For information only (%d) — nothing to do:', count($information)));
            foreach (self::group_by_title($information) as $title => $count) {
                \WP_CLI::log(sprintf('  %s (%d)', $title, $count));
            }
        }

        \WP_CLI::log('');
        if ($needs_a_person === []) {
            \WP_CLI::success(__('Nothing needs a person right now.', 'dcc-ledger'));
            return;
        }
        \WP_CLI::warning(sprintf('%d items need a person.', count($needs_a_person)));
    }

    /**
     * Information items, counted under their own headings.
     *
     * @param array<int,array<string,mixed>> $items
     * @return array<string,int>
     */
    private static function group_by_title(array $items): array
    {
        $groups = [];
        foreach ($items as $item) {
            $title = (string) $item['title'];
            $groups[$title] = ($groups[$title] ?? 0) + 1;
        }
        ksort($groups);

        return $groups;
    }
}
