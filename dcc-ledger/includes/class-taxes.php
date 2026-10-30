<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The tax inside each direct booking's total, frozen the way an Original is.
 *
 * Money questions are answered from the ledger's own frozen copy, never from
 * a live read, so a figure never moves under Rob's feet between one page
 * load and the next. This is a money question: it decides how much of a
 * booking's total is room revenue.
 *
 * A reading is written once and then left alone. If MotoPress's breakdown
 * later changes, the new reading is a NEW version beside the old one and the
 * old one is marked superseded — the same rule Originals follows, and for
 * the same reason.
 */
final class Taxes
{
    /**
     * @param array{total_cents:int,tax_cents:int,known:bool,has_tax_line:bool,reason:string} $reading
     */
    public static function content_hash(int $booking_id, array $reading): string
    {
        return sha1((string) wp_json_encode([
            'mphb_booking_id' => $booking_id,
            'total_cents'     => (int) $reading['total_cents'],
            'tax_cents'       => (int) $reading['tax_cents'],
            'is_known'        => (bool) $reading['known'],
            'reason'          => (string) $reading['reason'],
        ]));
    }

    public static function current(int $booking_id): ?array
    {
        global $wpdb;
        $table = Schema::booking_taxes();
        $row   = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE mphb_booking_id = %d AND is_current = 1 LIMIT 1",
                $booking_id
            ),
            ARRAY_A
        );

        return $row ?: null;
    }

    /**
     * Freeze a reading.
     *
     * @param array{total_cents:int,tax_cents:int,known:bool,has_tax_line:bool,reason:string} $reading
     * @return string 'new', 'unchanged' or 'changed'
     */
    public static function capture(int $booking_id, array $reading, int $batch_id): string
    {
        global $wpdb;

        $hash    = self::content_hash($booking_id, $reading);
        $current = self::current($booking_id);

        if ($current !== null && (string) $current['content_hash'] === $hash) {
            return 'unchanged';
        }

        $version = 1;
        if ($current !== null) {
            $version = (int) $current['version'] + 1;
            $wpdb->update(
                Schema::booking_taxes(),
                ['is_current' => 0, 'superseded_at' => Dates::now()],
                ['id' => (int) $current['id']]
            );
        }

        $wpdb->insert(Schema::booking_taxes(), [
            'mphb_booking_id' => $booking_id,
            'version'         => $version,
            'is_current'      => 1,
            'total_cents'     => (int) $reading['total_cents'],
            'tax_cents'       => (int) $reading['tax_cents'],
            'is_known'        => $reading['known'] ? 1 : 0,
            'has_tax_line'    => $reading['has_tax_line'] ? 1 : 0,
            'reason'          => (string) $reading['reason'],
            'content_hash'    => $hash,
            'source_batch'    => $batch_id,
            'captured_at'     => Dates::now(),
        ]);

        return $current === null ? 'new' : 'changed';
    }

    /**
     * Every current reading, by booking id.
     *
     * A booking with no row here has an unknown tax, the same as one whose
     * breakdown did not prove itself: the ledger has not read it yet.
     *
     * @return array<int,array{tax_cents:int,known:bool,has_tax_line:bool,reason:string}>
     */
    public static function current_map(): array
    {
        global $wpdb;
        $table = Schema::booking_taxes();

        $rows = $wpdb->get_results(
            "SELECT mphb_booking_id, tax_cents, is_known, has_tax_line, reason
               FROM {$table} WHERE is_current = 1",
            ARRAY_A
        ) ?: [];

        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row['mphb_booking_id']] = [
                'tax_cents'    => (int) $row['tax_cents'],
                'known'        => (int) $row['is_known'] === 1,
                'has_tax_line' => (int) $row['has_tax_line'] === 1,
                'reason'       => (string) $row['reason'],
            ];
        }

        return $out;
    }

    /**
     * What the ledger knows about direct tax, for the screen and the CLI.
     *
     * @return array{read:int,known:int,unknown:int,with_tax_line:int,tax_cents:int,reasons:array<string,int>}
     */
    public static function coverage(): array
    {
        $out = ['read' => 0, 'known' => 0, 'unknown' => 0, 'with_tax_line' => 0, 'tax_cents' => 0, 'reasons' => []];

        foreach (self::current_map() as $reading) {
            $out['read']++;
            if ($reading['known']) {
                $out['known']++;
                $out['tax_cents'] += $reading['tax_cents'];
            } else {
                $out['unknown']++;
            }
            if ($reading['has_tax_line']) {
                $out['with_tax_line']++;
            }
            $out['reasons'][$reading['reason']] = ($out['reasons'][$reading['reason']] ?? 0) + 1;
        }

        return $out;
    }
}
