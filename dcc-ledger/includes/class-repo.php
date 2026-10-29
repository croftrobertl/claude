<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The only class that writes to the ledger tables. It never touches a MotoPress
 * table — not posts, not postmeta, not MotoPress's own tables.
 */
final class Repo
{
    /**
     * Natural key for a money line. Re-importing the same file produces the
     * same hashes, so UNIQUE(hash) turns a repeat import into zero new rows.
     *
     * $seq distinguishes genuinely repeated rows inside one file (Vrbo splits a
     * reservation across several payout rows, sometimes identical ones). It is
     * derived from the row's position among identical keys, so it is stable
     * across re-imports of the same file.
     *
     * @param array<string,mixed> $line
     */
    public static function line_hash(array $line, int $seq = 0): string
    {
        $meta = is_array($line['meta'] ?? null) ? $line['meta'] : [];
        $parts = [
            'channel'    => (string) $line['channel'],
            'type'       => (string) $line['type'],
            'stay_code'  => (string) ($line['stay_code'] ?? ''),
            'event_date' => (string) ($line['event_date'] ?? ''),
            // Formatted as the decimal string it has always been, so every
            // hash written before 0.2.0 still matches and no import of
            // Rob's existing files comes back as new.
            'amount'     => Money::to_decimal((int) $line['amount_cents']),
            'payout_ref' => (string) ($line['payout_ref'] ?? ''),
            'ref_code'   => (string) ($line['ref_code'] ?? ''),
            'source'     => (string) ($meta['source'] ?? ''),
            'column'     => (string) ($meta['column'] ?? ''),
            'seq'        => $seq,
        ];
        return sha1((string) wp_json_encode($parts));
    }

    /** @return array<string,mixed>|null */
    public static function find_stay(string $channel, string $code): ?array
    {
        global $wpdb;
        $table = Schema::stays();
        $row   = $wpdb->get_row(
            $wpdb->prepare("SELECT * FROM {$table} WHERE channel = %s AND code = %s", $channel, $code),
            ARRAY_A
        );
        return $row ?: null;
    }

    /** One stay by its own id, or null. */
    public static function stay_by_id(int $stay_id): ?array
    {
        global $wpdb;
        $table = Schema::stays();
        $row   = $wpdb->get_row(
            $wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $stay_id),
            ARRAY_A
        );

        return $row ?: null;
    }

    public static function stay_id(string $channel, string $code): ?int
    {
        global $wpdb;
        $table = Schema::stays();
        $id    = $wpdb->get_var(
            $wpdb->prepare("SELECT id FROM {$table} WHERE channel = %s AND code = %s", $channel, $code)
        );
        return $id === null ? null : (int) $id;
    }

    /**
     * Insert a stay, or fill in fields the existing row does not have yet.
     *
     * An existing row is never overwritten: a payout file knows less than a
     * reservations file, and whichever arrives second must not blank out what
     * the first one learned. Every field this does fill is recorded so undo can
     * put the row back exactly as it was.
     *
     * @param array<string,mixed> $stay
     * @return array{id:int,action:string,undo:array<string,mixed>|null}
     */
    public static function upsert_stay(array $stay, int $batch_id): array
    {
        global $wpdb;
        $table = Schema::stays();
        $now   = Dates::now();

        $existing = self::find_stay((string) $stay['channel'], (string) $stay['code']);

        if ($existing === null) {
            $wpdb->insert($table, [
                'channel'      => (string) $stay['channel'],
                'code'         => (string) $stay['code'],
                'cottage'      => (string) $stay['cottage'],
                'check_in'     => $stay['check_in'],
                'check_out'    => $stay['check_out'],
                'nights'       => $stay['nights'],
                'booked_on'    => $stay['booked_on'],
                'status'       => (string) $stay['status'],
                'persons'      => $stay['persons'],
                'source_batch' => $batch_id,
                'guest_keys'   => Names::encode($stay['guest_keys'] ?? []),
                'meta'         => self::encode_meta($stay['meta'] ?? []),
                'created_at'   => $now,
                'updated_at'   => $now,
            ]);
            return ['id' => (int) $wpdb->insert_id, 'action' => 'new', 'undo' => null];
        }

        $fill = [];
        $undo = [];

        // A later file may know the guest's name when the first one did not.
        $incoming_keys = Names::encode($stay['guest_keys'] ?? []);
        if ($incoming_keys !== null && ($existing['guest_keys'] ?? null) === null) {
            $fill['guest_keys'] = $incoming_keys;
            $undo['guest_keys'] = null;
        }

        foreach (['check_in', 'check_out', 'nights', 'booked_on', 'persons'] as $field) {
            $value = $stay[$field] ?? null;
            if ($value !== null && $value !== '' && ($existing[$field] ?? null) === null) {
                $fill[$field] = $value;
                $undo[$field] = null;
            }
        }
        // A cancellation learned from a later file is worth keeping; an 'ok'
        // never downgrades a cancelled or expired stay.
        if (($stay['status'] ?? 'ok') !== 'ok' && ($existing['status'] ?? 'ok') === 'ok') {
            $fill['status'] = (string) $stay['status'];
            $undo['status'] = (string) $existing['status'];
        }

        if ($fill === []) {
            return ['id' => (int) $existing['id'], 'action' => 'unchanged', 'undo' => null];
        }

        $fill['updated_at'] = $now;
        $undo['updated_at'] = (string) $existing['updated_at'];
        $wpdb->update($table, $fill, ['id' => (int) $existing['id']]);

        return [
            'id'     => (int) $existing['id'],
            'action' => 'enriched',
            'undo'   => ['id' => (int) $existing['id'], 'fields' => $undo],
        ];
    }

    public static function line_exists(string $hash): bool
    {
        global $wpdb;
        $table = Schema::lines();
        return (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE hash = %s", $hash)
        ) > 0;
    }

    /**
     * @param array<string,mixed> $line
     * @return string 'new' or 'unchanged'
     */
    public static function insert_line(array $line, string $hash, ?int $stay_id, int $batch_id): string
    {
        global $wpdb;
        $table = Schema::lines();

        if (self::line_exists($hash)) {
            return 'unchanged';
        }

        $wpdb->insert($table, [
            'stay_id'      => $stay_id,
            'channel'      => (string) $line['channel'],
            'type'         => (string) $line['type'],
            // Cents are the figure. The decimal column beside them is a
            // mirror, kept so the conversion can be rolled back and so an
            // older release could read the table.
            'amount'       => Money::to_decimal((int) $line['amount_cents']),
            'amount_cents' => (int) $line['amount_cents'],
            'event_date'   => $line['event_date'],
            'payout_ref'   => $line['payout_ref'] ?? null,
            'ref_code'     => $line['ref_code'] ?? null,
            'source_batch' => $batch_id,
            'meta'         => self::encode_meta($line['meta'] ?? []),
            'hash'         => $hash,
            'created_at'   => Dates::now(),
        ]);

        return $wpdb->insert_id ? 'new' : 'unchanged';
    }

    /**
     * @param array<string,mixed> $meta
     */
    private static function encode_meta(array $meta): ?string
    {
        $meta = array_filter($meta, static fn ($v) => $v !== null && $v !== '');
        return $meta === [] ? null : (string) wp_json_encode($meta);
    }

    /** @return array<string,mixed> */
    public static function decode_meta(?string $meta): array
    {
        if ($meta === null || $meta === '') {
            return [];
        }
        $decoded = json_decode($meta, true);
        return is_array($decoded) ? $decoded : [];
    }

    // ---------------------------------------------------------------- links

    /**
     * @return array<int,array<string,mixed>>
     */
    public static function links_for_stay(int $stay_id): array
    {
        global $wpdb;
        $table = Schema::links();
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table} WHERE stay_id = %d ORDER BY id", $stay_id),
            ARRAY_A
        ) ?: [];
    }

    /** The one import link (code | exact | manual), if the stay has one. */
    public static function import_link(int $stay_id): ?array
    {
        global $wpdb;
        $table = Schema::links();
        $row   = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE stay_id = %d AND method <> 'copy' ORDER BY id LIMIT 1",
                $stay_id
            ),
            ARRAY_A
        );
        return $row ?: null;
    }

    /**
     * The link a booking already carries, or null.
     *
     * A MotoPress booking is one stay. It can be the imported booking of a
     * platform stay, or a hand-typed copy of one, but never both and never
     * two of either — linking it twice would have the same nights counted
     * against two reservations.
     *
     * @return array<string,mixed>|null
     */
    public static function link_for_booking(int $booking_id): ?array
    {
        global $wpdb;
        $table = Schema::links();
        $row   = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE mphb_booking_id = %d ORDER BY id LIMIT 1",
                $booking_id
            ),
            ARRAY_A
        );

        return $row ?: null;
    }

    /**
     * A stay has at most one import link (code | exact | manual) and any number
     * of 'copy' links to hand-typed direct bookings.
     *
     * @return bool true when a link was created
     */
    public static function link(int $stay_id, int $booking_id, string $method, ?int $user_id = null): bool
    {
        global $wpdb;
        if (!in_array($method, ['code', 'exact', 'manual', 'copy'], true)) {
            return false;
        }
        // A link to a stay that does not exist is worse than no link: it
        // looks like a decision somebody made. 0.1.3 wrote three of them.
        if ($stay_id <= 0 || $booking_id <= 0) {
            return false;
        }
        if ($method !== 'copy' && self::import_link($stay_id) !== null) {
            return false;
        }
        // One booking, one stay. Already linked anywhere — to this stay or
        // another — and it is not linked again.
        if (self::link_for_booking($booking_id) !== null) {
            return false;
        }
        $table = Schema::links();
        $wpdb->insert($table, [
            'stay_id'         => $stay_id,
            'mphb_booking_id' => $booking_id,
            'method'          => $method,
            'linked_at'       => Dates::now(),
            'linked_by'       => $user_id,
        ]);
        $created = (bool) $wpdb->insert_id;
        if ($created) {
            Reports::flush_cache();
        }
        return $created;
    }

    public static function unlink(int $link_id): bool
    {
        global $wpdb;
        $table = Schema::links();
        $done  = (bool) $wpdb->delete($table, ['id' => $link_id]);
        if ($done) {
            Reports::flush_cache();
        }
        return $done;
    }

    /** @return array<int,array<string,mixed>> every link, keyed by nothing in particular */
    public static function all_links(): array
    {
        global $wpdb;
        $table = Schema::links();
        return $wpdb->get_results("SELECT * FROM {$table}", ARRAY_A) ?: [];
    }

    // -------------------------------------------------------------- reviews

    public static function mark_reviewed(string $issue_key, string $note, ?int $user_id): void
    {
        global $wpdb;
        $table = Schema::reviews();

        $existing = $wpdb->get_var(
            $wpdb->prepare("SELECT id FROM {$table} WHERE issue_key = %s", $issue_key)
        );

        $fields = [
            'note'        => $note,
            'reviewed_at' => Dates::now(),
            'reviewed_by' => $user_id,
        ];

        if ($existing !== null) {
            $wpdb->update($table, $fields, ['id' => (int) $existing]);
            return;
        }

        $wpdb->insert($table, array_merge(['issue_key' => $issue_key], $fields));
    }

    public static function unmark_reviewed(string $issue_key): void
    {
        global $wpdb;
        $table = Schema::reviews();
        $wpdb->delete($table, ['issue_key' => $issue_key]);
    }

    /** @return array<string,array<string,mixed>> issue key => review row */
    public static function reviews(): array
    {
        global $wpdb;
        $table = Schema::reviews();
        $rows  = $wpdb->get_results("SELECT * FROM {$table}", ARRAY_A) ?: [];
        $out   = [];
        foreach ($rows as $row) {
            $out[(string) $row['issue_key']] = $row;
        }
        return $out;
    }
}
