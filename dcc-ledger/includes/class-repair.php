<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Cleaning up after the ledger's own past mistakes.
 *
 * 0.1.3's seeding of Rob's confirmed moves read the wrong key, so where it
 * found no stay it linked to stay 0 instead of linking nothing. Those rows
 * point at a stay that does not exist. They are harmless to the figures —
 * nothing joins to a stay that is not there — but they sit in the links table
 * looking like decisions somebody made, and they would confuse the next person
 * to read it.
 *
 * They are removed as a recorded batch, so the removal is visible on the
 * Imports tab and can be undone like any other. Nothing here deletes quietly.
 */
final class Repair
{
    public const KIND = 'repair_bad_links';

    /**
     * Links pointing at a stay that does not exist.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function bad_links(): array
    {
        global $wpdb;

        $links = Schema::links();
        $stays = Schema::stays();

        return $wpdb->get_results(
            "SELECT l.* FROM {$links} l
               LEFT JOIN {$stays} s ON s.id = l.stay_id
              WHERE s.id IS NULL
              ORDER BY l.id",
            ARRAY_A
        ) ?: [];
    }

    /**
     * Remove them, as an undoable batch.
     *
     * @return array{removed:int,batch_id:int|null}
     */
    public static function remove_bad_links(?int $user_id = null): array
    {
        global $wpdb;

        $bad = self::bad_links();
        if ($bad === []) {
            return ['removed' => 0, 'batch_id' => null];
        }

        $batch_id = Batches::create(
            self::KIND,
            __('Removed links pointing at a stay that does not exist', 'dcc-ledger'),
            $user_id
        );

        $table   = Schema::links();
        $removed = 0;

        foreach ($bad as $link) {
            $removed += (int) $wpdb->delete($table, ['id' => (int) $link['id']]);
        }

        Batches::finish($batch_id, [
            'read'      => count($bad),
            'inserted'  => 0,
            'unchanged' => 0,
            'skipped'   => 0,
            'excluded'  => 0,
        ], [], [], $bad);

        Reports::flush_cache();

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log(sprintf('DCCL: repair batch %d removed %d bad links', $batch_id, $removed));
        }

        return ['removed' => $removed, 'batch_id' => $batch_id];
    }

    /**
     * Run after an upgrade. A fresh install has no links, so this does
     * nothing; an install that ever ran 0.1.3 is tidied, visibly.
     */
    public static function on_upgrade(?int $user_id = null): void
    {
        self::remove_bad_links($user_id);
    }
}
