<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Corrections, each one labelled, each one sitting on top of an Original.
 *
 * Nothing here edits an Original. A report can show the Originals alone (what
 * MotoPress held), the ledger (Originals plus these), or the difference — so
 * every correction is visible as a correction rather than absorbed into a
 * figure.
 */
final class Adjustments
{
    public const ASSUMED_PAID    = 'assumed_paid';
    public const COPY_NOT_COUNTED = 'copy_not_counted';
    public const MANUAL          = 'manual';

    public static function label_for(string $type): string
    {
        $labels = [
            self::ASSUMED_PAID     => __('Assumed Paid In Full', 'dcc-ledger'),
            self::COPY_NOT_COUNTED => __('Copy Of An OTA Stay, Not Counted', 'dcc-ledger'),
            self::MANUAL           => __('Manual Correction', 'dcc-ledger'),
        ];
        return $labels[$type] ?? $type;
    }

    /**
     * @param array<string,mixed> $adjustment
     */
    public static function hash(array $adjustment): string
    {
        $parts = [
            'type'            => (string) $adjustment['type'],
            'mphb_booking_id' => (int) ($adjustment['mphb_booking_id'] ?? 0),
            'stay_id'         => (int) ($adjustment['stay_id'] ?? 0),
            'amount'          => number_format((float) $adjustment['amount'], 2, '.', ''),
            'event_date'      => (string) ($adjustment['event_date'] ?? ''),
            'label'           => (string) $adjustment['label'],
        ];
        return sha1((string) wp_json_encode($parts));
    }

    /**
     * @param array<string,mixed> $adjustment
     * @return string 'new' or 'unchanged'
     */
    public static function add(array $adjustment, ?int $batch_id = null, ?int $user_id = null): string
    {
        global $wpdb;

        $hash  = self::hash($adjustment);
        $table = Schema::adjustments();

        $exists = (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE hash = %s", $hash)
        ) > 0;

        if ($exists) {
            return 'unchanged';
        }

        $wpdb->insert($table, [
            'type'            => (string) $adjustment['type'],
            'channel'         => (string) ($adjustment['channel'] ?? 'direct'),
            'mphb_booking_id' => $adjustment['mphb_booking_id'] ?? null,
            'stay_id'         => $adjustment['stay_id'] ?? null,
            'cottage'         => $adjustment['cottage'] ?? null,
            'amount'          => number_format((float) $adjustment['amount'], 2, '.', ''),
            'event_date'      => $adjustment['event_date'] ?? null,
            'label'           => mb_substr((string) $adjustment['label'], 0, 190),
            'note'            => isset($adjustment['note']) ? mb_substr((string) $adjustment['note'], 0, 500) : null,
            'hash'            => $hash,
            'source_batch'    => $batch_id,
            'created_at'      => current_time('mysql'),
            'created_by'      => $user_id,
        ]);

        Reports::flush_cache();

        return $wpdb->insert_id ? 'new' : 'unchanged';
    }

    public static function remove(int $id): bool
    {
        global $wpdb;
        $done = (bool) $wpdb->delete(Schema::adjustments(), ['id' => $id]);
        if ($done) {
            Reports::flush_cache();
        }
        return $done;
    }

    /** @return array<int,array<string,mixed>> */
    public static function all(): array
    {
        global $wpdb;
        $table = Schema::adjustments();
        return $wpdb->get_results("SELECT * FROM {$table} ORDER BY event_date, id", ARRAY_A) ?: [];
    }

    /**
     * Adjustments of one booking.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function for_booking(int $booking_id): array
    {
        global $wpdb;
        $table = Schema::adjustments();
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table} WHERE mphb_booking_id = %d ORDER BY id", $booking_id),
            ARRAY_A
        ) ?: [];
    }

    public static function count(?string $type = null): int
    {
        global $wpdb;
        $table = Schema::adjustments();
        if ($type === null) {
            return (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
        }
        return (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE type = %s", $type)
        );
    }

    public static function total(?string $type = null): float
    {
        global $wpdb;
        $table = Schema::adjustments();
        if ($type === null) {
            return round((float) $wpdb->get_var("SELECT COALESCE(SUM(amount), 0) FROM {$table}"), 2);
        }
        return round((float) $wpdb->get_var(
            $wpdb->prepare("SELECT COALESCE(SUM(amount), 0) FROM {$table} WHERE type = %s", $type)
        ), 2);
    }
}
