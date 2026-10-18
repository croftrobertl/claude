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
     * Print the cleanup list.
     *
     * @param array<int,string>    $args
     * @param array<string,string> $assoc
     */
    public function cleanup(array $args, array $assoc): void
    {
        $items = Issues::open();
        if ($items === []) {
            \WP_CLI::success(__('Nothing needs a person right now.', 'dcc-ledger'));
            return;
        }
        foreach ($items as $item) {
            \WP_CLI::log('');
            \WP_CLI::log($item['title'] . '  [' . $item['key'] . ']');
            foreach ($item['facts'] as $fact) {
                \WP_CLI::log('  - ' . $fact);
            }
            \WP_CLI::log('  → ' . $item['action']);
        }
        \WP_CLI::log('');
        \WP_CLI::warning(sprintf('%d items need a person.', count($items)));
    }
}
