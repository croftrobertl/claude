<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The ledger's own copy of MotoPress — Rob's data, duplicated and then left
 * alone.
 *
 * An Original row is frozen the moment it is written. Nothing in this plugin
 * edits one: when MotoPress changes, the change is written as a NEW version
 * beside the old one, the old one is marked superseded, and the cleanup list
 * says so. If the ledger's own corrections ever turn out to be wrong, the
 * Original is still there, exactly as MotoPress held it.
 *
 * update() exists only to refuse — see the method comment.
 */
final class Originals
{
    public const KIND_BOOKING = 'booking';
    public const KIND_PAYMENT = 'payment';

    /** The only columns that may ever change after a row is written. */
    private const VERSIONING_FIELDS = ['is_current', 'superseded_at'];

    /**
     * Content hash: everything the ledger copied. Two snapshots of unchanged
     * MotoPress data produce the same hash, so a repeat snapshot writes
     * nothing; one changed field produces a new hash, and so a new version.
     *
     * @param array<string,mixed> $row
     */
    public static function content_hash(array $row): string
    {
        $parts = [
            'kind'            => (string) $row['kind'],
            'mphb_id'         => (int) $row['mphb_id'],
            'mphb_booking_id' => (int) ($row['mphb_booking_id'] ?? 0),
            'cottage'         => (string) ($row['cottage'] ?? ''),
            'check_in'        => (string) ($row['check_in'] ?? ''),
            'check_out'       => (string) ($row['check_out'] ?? ''),
            'booking_status'  => (string) ($row['booking_status'] ?? ''),
            'payment_status'  => (string) ($row['payment_status'] ?? ''),
            // A booking row carries a total and no amount; a payment row the
            // other way round. Both keys are optional here.
            // Formatted as the decimal string the hash has always used, so
            // the 0.2.0 move to cents does not re-version every Original.
            'total'           => ($row['total_cents'] ?? null) === null ? '' : Money::to_decimal((int) $row['total_cents']),
            'amount'          => ($row['amount_cents'] ?? null) === null ? '' : Money::to_decimal((int) $row['amount_cents']),
            'event_date'      => (string) ($row['event_date'] ?? ''),
            'codes'           => (array) ($row['codes'] ?? []),
            'guest_keys'      => (array) ($row['guest_keys'] ?? []),
        ];
        return sha1((string) wp_json_encode($parts));
    }

    /** The version of this MotoPress row the ledger currently treats as true. */
    public static function current(string $kind, int $mphb_id): ?array
    {
        global $wpdb;
        $table = self::table();
        $row   = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE kind = %s AND mphb_id = %d AND is_current = 1 LIMIT 1",
                $kind,
                $mphb_id
            ),
            ARRAY_A
        );
        return $row ?: null;
    }

    /**
     * Write a copy of a MotoPress row.
     *
     * @param array<string,mixed> $row
     * @return array{action:string,id:int,superseded:int|null}
     *         action is 'new', 'unchanged' or 'changed'
     */
    public static function capture(array $row, int $batch_id): array
    {
        global $wpdb;

        $hash    = self::content_hash($row);
        $current = self::current((string) $row['kind'], (int) $row['mphb_id']);

        if ($current !== null && (string) $current['content_hash'] === $hash) {
            return ['action' => 'unchanged', 'id' => (int) $current['id'], 'superseded' => null];
        }

        // MotoPress has changed since this was copied. The old version stays
        // exactly as it is; it just stops being the current one.
        $superseded = null;
        $version    = 1;

        if ($current !== null) {
            $version    = (int) $current['version'] + 1;
            $superseded = (int) $current['id'];
            $wpdb->update(
                self::table(),
                ['is_current' => 0, 'superseded_at' => Dates::now()],
                ['id' => $superseded]
            );
        }

        $wpdb->insert(self::table(), [
            'kind'            => (string) $row['kind'],
            'mphb_id'         => (int) $row['mphb_id'],
            'mphb_booking_id' => $row['mphb_booking_id'] ?? null,
            'version'         => $version,
            'is_current'      => 1,
            'channel'         => (string) ($row['channel'] ?? 'direct'),
            'cottage'         => $row['cottage'] ?? null,
            'check_in'        => $row['check_in'] ?? null,
            'check_out'       => $row['check_out'] ?? null,
            'booking_status'  => $row['booking_status'] ?? null,
            'payment_status'  => $row['payment_status'] ?? null,
            // Cents are the figure; the decimals beside them are a mirror,
            // kept so the 0.2.0 conversion can be rolled back.
            'total'           => ($row['total_cents'] ?? null) === null ? null : Money::to_decimal((int) $row['total_cents']),
            'total_cents'     => $row['total_cents'] ?? null,
            'amount'          => ($row['amount_cents'] ?? null) === null ? null : Money::to_decimal((int) $row['amount_cents']),
            'amount_cents'    => $row['amount_cents'] ?? null,
            'event_date'      => $row['event_date'] ?? null,
            // Only the extracted OTA codes, never the note they came from.
            'codes'           => ($row['codes'] ?? []) === [] ? null : (string) wp_json_encode($row['codes']),
            'guest_keys'      => Names::encode($row['guest_keys'] ?? []),
            'content_hash'    => $hash,
            'source_batch'    => $batch_id,
            'captured_at'     => Dates::now(),
        ]);

        return [
            'action'     => $current === null ? 'new' : 'changed',
            'id'         => (int) $wpdb->insert_id,
            'superseded' => $superseded,
        ];
    }

    /**
     * Refuses.
     *
     * An Original is a copy of what MotoPress held at a moment in time. Editing
     * one would make it a copy of nothing. Corrections go in the adjustments
     * table, where they are labelled and can be undone; a changed MotoPress row
     * becomes a new version through capture(). The only fields that may move
     * are the two that say which version is current.
     *
     * @param array<string,mixed> $fields
     */
    public static function update(int $id, array $fields): bool
    {
        global $wpdb;

        foreach (array_keys($fields) as $field) {
            if (!in_array($field, self::VERSIONING_FIELDS, true)) {
                return false; // An Original is never edited.
            }
        }

        return (bool) $wpdb->update(self::table(), $fields, ['id' => $id]);
    }

    /**
     * Current Originals of one kind.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function all(string $kind): array
    {
        global $wpdb;
        $table = self::table();
        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE kind = %s AND is_current = 1 ORDER BY mphb_id",
                $kind
            ),
            ARRAY_A
        ) ?: [];
    }

    /**
     * Current booking Originals with their payments attached.
     *
     * @return array<int,array<string,mixed>> keyed by MotoPress booking id
     */
    public static function bookings_with_payments(): array
    {
        $bookings = [];
        foreach (self::all(self::KIND_BOOKING) as $row) {
            $row['payments'] = [];
            $row['paid']     = 0;
            $row['refunded'] = 0;
            $bookings[(int) $row['mphb_id']] = $row;
        }

        foreach (self::all(self::KIND_PAYMENT) as $payment) {
            $booking_id = (int) $payment['mphb_booking_id'];
            if (!isset($bookings[$booking_id])) {
                continue;
            }
            $bookings[$booking_id]['payments'][] = $payment;

            $amount = (int) $payment['amount_cents'];
            if ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_COMPLETED) {
                $bookings[$booking_id]['paid'] = $bookings[$booking_id]['paid'] + $amount;
            } elseif ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_REFUNDED) {
                // Kept visible, never added: MotoPress leaves the amount on a
                // refunded payment, so counting it would overstate the money.
                $bookings[$booking_id]['refunded'] = $bookings[$booking_id]['refunded'] + $amount;
            }
        }

        return $bookings;
    }

    /** Versions that are no longer current, newest first. */
    public static function superseded(): array
    {
        global $wpdb;
        $table = self::table();
        return $wpdb->get_results(
            "SELECT * FROM {$table} WHERE is_current = 0 ORDER BY superseded_at DESC, id DESC",
            ARRAY_A
        ) ?: [];
    }

    public static function count(string $kind): int
    {
        global $wpdb;
        $table = self::table();
        return (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE kind = %s AND is_current = 1", $kind)
        );
    }

    public static function last_snapshot_at(): ?string
    {
        global $wpdb;
        $table = self::table();
        $when  = $wpdb->get_var("SELECT MAX(captured_at) FROM {$table}");
        return $when === null ? null : (string) $when;
    }

    private static function table(): string
    {
        return Schema::originals();
    }
}
