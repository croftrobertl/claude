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
        'direct-total'   => 'direct_total',
        'direct-tax'     => 'direct_tax',
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

        // The two invariants that were wrong on live and visible on no
        // screen. Checked over the real data, month by month.
        \WP_CLI::log('');
        \WP_CLI::log('Figures:');
        $audit  = Audit::run();
        $sound  = true;
        foreach ($audit as $check) {
            $sound = $sound && $check['ok'];
            \WP_CLI::log(sprintf(
                '  %s %-34s %s',
                $check['ok'] ? 'OK  ' : '!!  ',
                $check['what'],
                $check['detail']
            ));
        }

        if (!$result['ok'] || $unconverted > 0 || !$sound) {
            \WP_CLI::error(__('The money is not in the state the ledger expects.', 'dcc-ledger'));
        }

        \WP_CLI::success(__('Every stored figure is in whole cents, every total ties, and no figure breaks its own rules.', 'dcc-ledger'));
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
     * What a direct booking's total is made of, on THIS site.
     *
     * Room revenue excludes tax, and the ledger now counts a direct
     * booking's total as its room revenue on the stay basis. Whether
     * `mphb_total_price` includes tax, a pet fee or other services depends
     * on how MotoPress is configured here — nobody can read that off the
     * code, and guessing moves every rate. So this prints the shape of the
     * data and leaves the reading to a person.
     *
     * Key names and counts only. No value is printed, because a value
     * could be a guest's.
     *
     * @subcommand direct-total
     * @alias direct_total
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function direct_total(array $args, array $assoc): void
    {
        $shape = Mphb_Reader::booking_meta_shape();

        if ($shape === []) {
            \WP_CLI::warning(__('No booking meta found at all. Either there are no bookings, or the post type is spelled differently here.', 'dcc-ledger'));

            return;
        }

        \WP_CLI::log(__('Every meta key on a MotoPress booking, with how many bookings carry it.', 'dcc-ledger'));
        \WP_CLI::log(__('"money" marks a key whose every value is a plain number.', 'dcc-ledger'));
        \WP_CLI::log('');

        foreach ($shape as $row) {
            \WP_CLI::log(sprintf(
                '  %-42s %6d  %s',
                $row['key'],
                $row['bookings'],
                $row['money_like'] ? 'money' : ''
            ));
        }

        \WP_CLI::log('');
        \WP_CLI::log(sprintf(
            /* translators: %s: the total meta key */
            __('The ledger reads %s as a direct booking\'s room revenue on the stay basis.', 'dcc-ledger'),
            Mphb_Reader::META_TOTAL
        ));
        \WP_CLI::log(__('Settled on 2026-10-30: the total INCLUDES room tax on this site, so room revenue is the total less the tax in its price breakdown. Run `wp dcc-ledger direct-tax` to see how much of that the ledger can read.', 'dcc-ledger'));
    }

    /**
     * How much of the tax inside the direct booking totals the ledger can read.
     *
     * The Director established on live on 2026-10-30 that
     * `mphb_total_price` includes room tax. Room revenue excludes tax, so
     * the ledger takes the tax out of each booking's price breakdown. This
     * prints how many bookings it could read and how many it could not,
     * with the reason — counts and money only, never a booking's contents.
     *
     * @subcommand direct-tax
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function direct_tax(array $args, array $assoc): void
    {
        $coverage = Taxes::coverage();

        if ($coverage['read'] === 0) {
            \WP_CLI::warning(__('No tax readings are stored. Run `wp dcc-ledger snapshot` first — the readings are frozen when the snapshot runs.', 'dcc-ledger'));

            return;
        }

        \WP_CLI::log(__('The tax inside each direct booking\'s total, read from its MotoPress price breakdown.', 'dcc-ledger'));
        \WP_CLI::log('');
        \WP_CLI::log(sprintf(__('Direct bookings read:          %d', 'dcc-ledger'), $coverage['read']));
        \WP_CLI::log(sprintf(__('  Tax known:                   %d', 'dcc-ledger'), $coverage['known']));
        \WP_CLI::log(sprintf(__('  Tax unknown:                 %d', 'dcc-ledger'), $coverage['unknown']));
        \WP_CLI::log(sprintf(__('  Listing a room tax:          %d', 'dcc-ledger'), $coverage['with_tax_line']));
        \WP_CLI::log(sprintf(__('  Tax taken out of revenue:    %s', 'dcc-ledger'), Money::format((int) $coverage['tax_cents'])));
        \WP_CLI::log('');
        \WP_CLI::log(__('Why a reading was not usable:', 'dcc-ledger'));
        foreach ($coverage['reasons'] as $reason => $count) {
            \WP_CLI::log(sprintf('  %-52s %6d', $reason, $count));
        }
        \WP_CLI::log('');
        \WP_CLI::log(__('A booking whose tax is unknown keeps its money in the money figures and stays out of every rate. An unknown is never a zero.', 'dcc-ledger'));
        \WP_CLI::log(__('Check this against what you counted on live: 117 confirmed bookings sampled with a breakdown, 76 of them listing room taxes. If "listing a room tax" disagrees with your count, the reader is reading the wrong part of the breakdown and the direct figures should not be trusted until it is fixed.', 'dcc-ledger'));
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
