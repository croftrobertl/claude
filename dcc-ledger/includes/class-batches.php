<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Import batches, and the undo that takes one back out again.
 *
 * Undo removes exactly what the batch inserted and restores exactly what it
 * filled in. A row that already existed before the batch ran is never deleted.
 */
final class Batches
{
    public static function create(string $kind, string $label, ?int $user_id): int
    {
        global $wpdb;
        $wpdb->insert(Schema::batches(), [
            'kind'       => $kind,
            // A label only: never a path, never anything from the file's rows.
            'label'      => mb_substr($label, 0, 190),
            'user_id'    => $user_id,
            'created_at' => current_time('mysql'),
        ]);
        return (int) $wpdb->insert_id;
    }

    /**
     * @param array<string,int>   $counts
     * @param array<int,array>    $undo  stay enrichments to reverse
     */
    public static function finish(int $batch_id, array $counts, array $undo): void
    {
        global $wpdb;
        $wpdb->update(Schema::batches(), [
            'rows_read'      => (int) ($counts['read'] ?? 0),
            'rows_inserted'  => (int) ($counts['inserted'] ?? 0),
            'rows_unchanged' => (int) ($counts['unchanged'] ?? 0),
            'rows_skipped'   => (int) ($counts['skipped'] ?? 0),
            'rows_excluded'  => (int) ($counts['excluded'] ?? 0),
            'undo_data'      => $undo === [] ? null : (string) wp_json_encode(['enriched' => $undo]),
        ], ['id' => $batch_id]);
    }

    /** @return array<int,array<string,mixed>> */
    public static function all(int $limit = 100): array
    {
        global $wpdb;
        $table = Schema::batches();
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table} ORDER BY id DESC LIMIT %d", $limit),
            ARRAY_A
        ) ?: [];
    }

    /** @return array<string,mixed>|null */
    public static function get(int $batch_id): ?array
    {
        global $wpdb;
        $table = Schema::batches();
        $row   = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $batch_id), ARRAY_A);
        return $row ?: null;
    }

    public static function is_undone(array $batch): bool
    {
        $data = json_decode((string) ($batch['undo_data'] ?? ''), true);
        return is_array($data) && !empty($data['undone']);
    }

    /**
     * @return array{ok:bool,message:string,stays:int,lines:int,restored:int}
     */
    public static function undo(int $batch_id): array
    {
        global $wpdb;

        $batch = self::get($batch_id);
        if ($batch === null) {
            return [
                'ok'       => false,
                'message'  => __('That batch does not exist.', 'dcc-ledger'),
                'stays'    => 0,
                'lines'    => 0,
                'restored' => 0,
            ];
        }
        if (self::is_undone($batch)) {
            return [
                'ok'       => false,
                'message'  => __('That batch has already been undone.', 'dcc-ledger'),
                'stays'    => 0,
                'lines'    => 0,
                'restored' => 0,
            ];
        }

        $stays_t = Schema::stays();
        $lines_t = Schema::lines();
        $links_t = Schema::links();

        // Lines this batch inserted.
        $lines = (int) $wpdb->query(
            $wpdb->prepare("DELETE FROM {$lines_t} WHERE source_batch = %d", $batch_id)
        );

        // Stays this batch inserted, and the links that only exist because of them.
        $stay_ids = $wpdb->get_col(
            $wpdb->prepare("SELECT id FROM {$stays_t} WHERE source_batch = %d", $batch_id)
        ) ?: [];

        $stays = 0;
        foreach ($stay_ids as $stay_id) {
            $stay_id = (int) $stay_id;
            $wpdb->query($wpdb->prepare("DELETE FROM {$links_t} WHERE stay_id = %d", $stay_id));
            $stays += (int) $wpdb->query($wpdb->prepare("DELETE FROM {$stays_t} WHERE id = %d", $stay_id));
        }

        // Fields this batch filled in on stays that already existed.
        $restored = 0;
        $undo     = json_decode((string) ($batch['undo_data'] ?? ''), true);
        if (is_array($undo) && isset($undo['enriched']) && is_array($undo['enriched'])) {
            foreach ($undo['enriched'] as $entry) {
                if (!isset($entry['id'], $entry['fields']) || !is_array($entry['fields'])) {
                    continue;
                }
                $wpdb->update($stays_t, $entry['fields'], ['id' => (int) $entry['id']]);
                $restored++;
            }
        }

        $wpdb->update(Schema::batches(), [
            'undo_data' => (string) wp_json_encode(['undone' => true, 'at' => current_time('mysql')]),
        ], ['id' => $batch_id]);

        Reports::flush_cache();

        return [
            'ok'       => true,
            'message'  => sprintf(
                /* translators: 1: number of stays, 2: number of money lines, 3: number of restored stays */
                __('Undone: %1$d stays and %2$d money lines removed, %3$d stays restored.', 'dcc-ledger'),
                $stays,
                $lines,
                $restored
            ),
            'stays'    => $stays,
            'lines'    => $lines,
            'restored' => $restored,
        ];
    }
}
