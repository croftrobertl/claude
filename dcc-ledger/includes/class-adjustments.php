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
    public const ASSUMED_PAID        = 'assumed_paid';
    public const ASSUMED_PRE_EXPORTS = 'assumed_paid_pre_exports';
    public const ASSUMED_REVERSAL    = 'assumed_paid_reversal';
    public const REFUND_UNRECORDED   = 'refund_not_recorded';
    public const COPY_NOT_COUNTED    = 'copy_not_counted';
    public const MANUAL              = 'manual';

    /**
     * Types that make up the assumed-payment figure. A reversal is negative,
     * so the two cancel out: if a booking ever stops being seen as a copy, no
     * assumed money reappears from under it.
     */
    public const ASSUMED_TYPES = [
        self::ASSUMED_PAID,
        self::ASSUMED_PRE_EXPORTS,
        self::ASSUMED_REVERSAL,
    ];

    /** The assumptions a reversal can take back. */
    public const ASSUMED_POSITIVE = [self::ASSUMED_PAID, self::ASSUMED_PRE_EXPORTS];

    public static function label_for(string $type): string
    {
        $labels = [
            self::ASSUMED_PAID        => __('Assumed Paid In Full', 'dcc-ledger'),
            self::ASSUMED_PRE_EXPORTS => __('Assumed Paid (Before The Exports)', 'dcc-ledger'),
            self::ASSUMED_REVERSAL    => __('Assumed Payment Reversed', 'dcc-ledger'),
            self::REFUND_UNRECORDED   => __('Refund Not Recorded In MotoPress', 'dcc-ledger'),
            self::COPY_NOT_COUNTED => __('Copy Of An OTA Stay, Not Counted', 'dcc-ledger'),
            self::MANUAL           => __('Manual Correction', 'dcc-ledger'),
        ];
        return $labels[$type] ?? $type;
    }

    /**
     * An adjustment's amount, in whole cents.
     *
     * Callers pass `amount_cents`. A plain `amount` is accepted from older
     * call sites and converted here rather than at each of them, so there
     * is one place where a dollar figure can become cents.
     *
     * @param array<string,mixed> $adjustment
     */
    public static function cents_of(array $adjustment): int
    {
        if (array_key_exists('amount_cents', $adjustment)) {
            return (int) $adjustment['amount_cents'];
        }

        return Money::to_cents($adjustment['amount'] ?? 0);
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
            'amount'          => Money::to_decimal(self::cents_of($adjustment)),
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
            // Cents are the figure; the decimal beside them is a mirror,
            // kept so the 0.2.0 conversion can be rolled back.
            'amount'          => Money::to_decimal(self::cents_of($adjustment)),
            'amount_cents'    => self::cents_of($adjustment),
            'event_date'      => $adjustment['event_date'] ?? null,
            'label'           => mb_substr((string) $adjustment['label'], 0, 190),
            'note'            => isset($adjustment['note']) ? mb_substr((string) $adjustment['note'], 0, 500) : null,
            'hash'            => $hash,
            'source_batch'    => $batch_id,
            'created_at'      => Dates::now(),
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

    /** The assumed payment on a booking, if it still has one standing. */
    public static function assumed_for(int $booking_id): ?array
    {
        $assumed  = null;
        $reversed = false;
        foreach (self::for_booking($booking_id) as $adjustment) {
            if (in_array((string) $adjustment['type'], self::ASSUMED_POSITIVE, true)) {
                $assumed = $adjustment;
            }
            if ((string) $adjustment['type'] === self::ASSUMED_REVERSAL) {
                $reversed = true;
            }
        }
        return $reversed ? null : $assumed;
    }

    /**
     * Every assumption still standing, newest first, for the list that offers
     * to reverse them.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function standing_assumptions(): array
    {
        $reversed = [];
        $assumed  = [];

        foreach (self::all() as $adjustment) {
            $booking_id = (int) $adjustment['mphb_booking_id'];
            if ((string) $adjustment['type'] === self::ASSUMED_REVERSAL) {
                $reversed[$booking_id] = true;
                continue;
            }
            if (in_array((string) $adjustment['type'], self::ASSUMED_POSITIVE, true)) {
                $assumed[$booking_id] = $adjustment;
            }
        }

        foreach (array_keys($reversed) as $booking_id) {
            unset($assumed[$booking_id]);
        }

        return array_values($assumed);
    }

    /** The refund standing against a booking, if it has one. */
    public static function refund_for(int $booking_id): ?array
    {
        foreach (self::for_booking($booking_id) as $adjustment) {
            if ((string) $adjustment['type'] === self::REFUND_UNRECORDED) {
                return $adjustment;
            }
        }
        return null;
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

    /** The total of every adjustment, or of one type, in whole cents. */
    public static function total(?string $type = null): int
    {
        global $wpdb;
        $table = Schema::adjustments();
        if ($type === null) {
            return (int) $wpdb->get_var("SELECT COALESCE(SUM(amount_cents), 0) FROM {$table}");
        }
        return (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COALESCE(SUM(amount_cents), 0) FROM {$table} WHERE type = %s", $type)
        );
    }
}
