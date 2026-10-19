<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Read-only access to MotoPress.
 *
 * MotoPress is the source of truth for direct-booking money and for the
 * bookings the iCal feeds imported. This plugin NEVER writes to it: an iCal
 * sync can delete and recreate an imported booking at any time, which would
 * erase anything written onto it. Every method here is a SELECT.
 *
 * Meta keys marked "verified" are the ones the Availability Calendar plugin
 * already queries successfully on live. The rest are MotoPress defaults that
 * still need confirming on staging — see the staging checklist.
 */
final class Mphb_Reader
{
    public const POST_TYPE_BOOKING       = 'mphb_booking';       // verified
    public const POST_TYPE_RESERVED_ROOM = 'mphb_reserved_room'; // verified
    public const POST_TYPE_PAYMENT       = 'mphb_payment';       // to confirm on staging

    public const META_CHECK_IN  = 'mphb_check_in_date';  // verified
    public const META_CHECK_OUT = 'mphb_check_out_date'; // verified
    public const META_ROOM_ID   = '_mphb_room_id';       // verified

    // Counted on live on 2026-10-19. The underscores and the status prefix are
    // not cosmetic: the unprefixed spellings return nothing at all, which would
    // report $0 rather than fail. Health::check() guards against exactly that.
    public const META_TOTAL          = 'mphb_total_price';
    public const META_PAYMENT_AMOUNT = '_mphb_amount';
    public const META_PAYMENT_BOOKING = '_mphb_booking_id';
    public const META_NOTE           = 'mphb_note';
    public const META_INTERNAL_NOTE  = '_mphb_booking_internal_notes';

    public const META_SYNC_ID        = '_mphb_sync_id';
    public const META_ICAL_PRODID    = 'mphb_ical_prodid';
    public const META_ICAL_SUMMARY   = 'mphb_ical_summary';
    public const META_ICAL_DESC      = 'mphb_ical_description';

    /** Statuses that mean the booking really happened. */
    public const LIVE_STATUSES = ['confirmed', 'pending', 'pending-payment'];

    /** Only a completed payment is money received. */
    public const PAYMENT_COMPLETED = 'mphb-p-completed';

    /**
     * MotoPress keeps the amount on a refunded payment, so a refund that is
     * counted as paid would overstate the money by its full value. Refunded
     * payments are reported on their own line instead.
     */
    public const PAYMENT_REFUNDED = 'mphb-p-refunded';

    public const PAYMENT_STATUSES = [
        'mphb-p-completed', 'mphb-p-refunded', 'mphb-p-cancelled',
        'mphb-p-abandoned', 'mphb-p-failed',
    ];

    /**
     * Every booking with its cottage, dates, channel, money and any OTA codes
     * found in its iCal fields or customer note.
     *
     * Guest names, emails, phones and addresses are never selected. The
     * customer note is read only to extract a confirmation code, and the note
     * itself is discarded inside the loop.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function bookings(): array
    {
        global $wpdb;

        $statuses = array_merge(self::LIVE_STATUSES, ['cancelled', 'abandoned']);
        $ph       = implode(',', array_fill(0, count($statuses), '%s'));

        $sql = "SELECT b.ID AS id,
                       b.post_status AS status,
                       b.post_date AS created,
                       ci.meta_value AS check_in,
                       co.meta_value AS check_out,
                       rid.meta_value AS room_id
                  FROM {$wpdb->posts} b
                  INNER JOIN {$wpdb->postmeta} ci  ON ci.post_id = b.ID AND ci.meta_key = %s
                  INNER JOIN {$wpdb->postmeta} co  ON co.post_id = b.ID AND co.meta_key = %s
                  LEFT  JOIN {$wpdb->posts} rr     ON rr.post_parent = b.ID AND rr.post_type = %s
                  LEFT  JOIN {$wpdb->postmeta} rid ON rid.post_id = rr.ID AND rid.meta_key = %s
                 WHERE b.post_type = %s
                   AND b.post_status IN ({$ph})
                 GROUP BY b.ID, b.post_status, b.post_date, ci.meta_value, co.meta_value, rid.meta_value
                 ORDER BY b.ID";

        $args = array_merge(
            [self::META_CHECK_IN, self::META_CHECK_OUT, self::POST_TYPE_RESERVED_ROOM, self::META_ROOM_ID, self::POST_TYPE_BOOKING],
            $statuses
        );

        try {
            $rows = $wpdb->get_results($wpdb->prepare($sql, ...$args), ARRAY_A) ?: [];
        } catch (\Throwable $e) {
            error_log('DCCL: booking query failed');
            return [];
        }

        if ($rows === []) {
            return [];
        }

        $ids      = array_map(static fn ($r) => (int) $r['id'], $rows);
        $meta     = self::meta_for($ids, [
            self::META_SYNC_ID,
            self::META_ICAL_PRODID,
            self::META_ICAL_SUMMARY,
            self::META_ICAL_DESC,
            self::META_TOTAL,
            self::META_NOTE,
            self::META_INTERNAL_NOTE,
        ]);
        $payments = self::payments_for($ids);

        $out = [];
        foreach ($rows as $row) {
            $id      = (int) $row['id'];
            $m       = $meta[$id] ?? [];
            $cottage = Cottages::from_mphb_room_id((int) $row['room_id']);

            $is_imported = isset($m[self::META_SYNC_ID]) && $m[self::META_SYNC_ID] !== '';
            $prodid      = (string) ($m[self::META_ICAL_PRODID] ?? '');

            // Codes come from the iCal fields on imported bookings and from the
            // customer note on hand-typed ones. Only the code is kept.
            $codes = self::codes_in(
                (string) ($m[self::META_ICAL_SUMMARY] ?? '') . ' ' . (string) ($m[self::META_ICAL_DESC] ?? '')
            );
            // Rob writes a platform id in either the customer note or the
            // staff-only internal note. Both are read; neither is kept.
            $note_codes = self::codes_in(
                (string) ($m[self::META_NOTE] ?? '') . ' ' . (string) ($m[self::META_INTERNAL_NOTE] ?? '')
            );

            $pay = $payments[$id] ?? ['recorded' => 0.0, 'refunded' => 0.0, 'count' => 0, 'events' => []];

            $out[] = [
                'id'          => $id,
                'status'      => (string) $row['status'],
                'check_in'    => $row['check_in'] ?: null,
                'check_out'   => $row['check_out'] ?: null,
                'room_id'     => (int) $row['room_id'],
                'cottage'     => $cottage,
                'is_imported' => $is_imported,
                'channel'     => $is_imported ? self::channel_from_prodid($prodid) : 'direct',
                'prodid'      => $prodid,
                'codes'       => $codes,
                'note_codes'  => $note_codes,
                'total'       => round((float) ($m[self::META_TOTAL] ?? 0), 2),
                // Paid means completed only. A refunded payment keeps its
                // amount in MotoPress, so it is reported apart, never added.
                'paid_recorded' => $pay['recorded'],
                'refunded'      => $pay['refunded'],
                'payment_count' => $pay['count'],
                // One entry per payment, whatever its status: id, date, amount
                // and status. The snapshot copies these verbatim.
                'payments'      => $pay['events'],
            ];
        }

        return $out;
    }

    /**
     * MotoPress records the producing calendar in mphb_ical_prodid. Two feeds
     * use "ddaysoftware", which names the software and not the channel, so
     * those are reported as unknown rather than guessed at.
     */
    public static function channel_from_prodid(string $prodid): string
    {
        $p = strtolower($prodid);
        if ($p === '') {
            return 'unknown';
        }
        if (str_contains($p, 'airbnb')) {
            return 'airbnb';
        }
        if (str_contains($p, 'booking')) {
            return 'bookingcom';
        }
        if (str_contains($p, 'vrbo') || str_contains($p, 'homeaway') || str_contains($p, 'expedia')) {
            return 'vrbo';
        }
        return 'unknown';
    }

    /**
     * Pull OTA confirmation codes out of free text.
     *
     * Patterns Rob's data actually uses, including the one he mislabelled
     * ("Airbnb ID: HA-…" on a Vrbo code). The text itself is never returned.
     *
     * @return array<int,array{channel:string,code:string}>
     */
    public static function codes_in(string $text): array
    {
        if (trim($text) === '') {
            return [];
        }
        $found = [];

        if (preg_match_all('/\bHM[A-Z0-9]{8}\b/i', $text, $m) > 0) {
            foreach ($m[0] as $code) {
                $found[] = ['channel' => 'airbnb', 'code' => strtoupper($code)];
            }
        }
        if (preg_match_all('/Booking\.?com\s*ID:\s*(\d{10})/i', $text, $m) > 0) {
            foreach ($m[1] as $code) {
                $found[] = ['channel' => 'bookingcom', 'code' => $code];
            }
        }
        // "VRBO ID: HA-XXXXXX", and the same code written as "Airbnb ID: HA-…".
        if (preg_match_all('/(?:VRBO|Airbnb|HomeAway)\s*ID:\s*(HA-[A-Z0-9]{4,10})/i', $text, $m) > 0) {
            foreach ($m[1] as $code) {
                $found[] = ['channel' => 'vrbo', 'code' => strtoupper($code)];
            }
        }
        if (preg_match_all('/\b(HA-[A-Z0-9]{4,10})\b/i', $text, $m) > 0) {
            foreach ($m[1] as $code) {
                $found[] = ['channel' => 'vrbo', 'code' => strtoupper($code)];
            }
        }

        $unique = [];
        foreach ($found as $entry) {
            $unique[$entry['channel'] . ':' . $entry['code']] = $entry;
        }
        return array_values($unique);
    }

    /**
     * @param int[]    $ids
     * @param string[] $keys
     * @return array<int,array<string,string>>
     */
    private static function meta_for(array $ids, array $keys): array
    {
        global $wpdb;
        if ($ids === [] || $keys === []) {
            return [];
        }
        $id_ph  = implode(',', array_fill(0, count($ids), '%d'));
        $key_ph = implode(',', array_fill(0, count($keys), '%s'));
        $sql    = "SELECT post_id, meta_key, meta_value
                     FROM {$wpdb->postmeta}
                    WHERE post_id IN ({$id_ph}) AND meta_key IN ({$key_ph})";
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...array_merge($ids, $keys)), ARRAY_A) ?: [];

        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row['post_id']][(string) $row['meta_key']] = (string) $row['meta_value'];
        }
        return $out;
    }

    /**
     * Every payment of these bookings, whatever its status.
     *
     * The payment is tied to its booking by the _mphb_booking_id meta, not by
     * post_parent. Only mphb-p-completed counts as paid.
     *
     * @param int[] $ids
     * @return array<int,array{recorded:float,refunded:float,count:int,events:array<int,array<string,mixed>>}>
     */
    private static function payments_for(array $ids): array
    {
        global $wpdb;
        if ($ids === []) {
            return [];
        }
        $id_ph = implode(',', array_fill(0, count($ids), '%d'));

        $sql = "SELECT p.ID AS payment_id,
                       bk.meta_value AS booking_id,
                       p.post_status AS payment_status,
                       p.post_date AS paid_on,
                       amt.meta_value AS amount
                  FROM {$wpdb->posts} p
                  INNER JOIN {$wpdb->postmeta} amt ON amt.post_id = p.ID AND amt.meta_key = %s
                  INNER JOIN {$wpdb->postmeta} bk  ON bk.post_id = p.ID AND bk.meta_key = %s
                 WHERE p.post_type = %s
                   AND bk.meta_value IN ({$id_ph})
                 ORDER BY p.ID";

        $args = array_merge(
            [self::META_PAYMENT_AMOUNT, self::META_PAYMENT_BOOKING, self::POST_TYPE_PAYMENT],
            $ids
        );

        try {
            $rows = $wpdb->get_results($wpdb->prepare($sql, ...$args), ARRAY_A) ?: [];
        } catch (\Throwable $e) {
            error_log('DCCL: payment query failed');
            return [];
        }

        $out = [];
        foreach ($rows as $row) {
            $id = (int) $row['booking_id'];
            $out[$id] ??= ['recorded' => 0.0, 'refunded' => 0.0, 'count' => 0, 'events' => []];
            $amount = round((float) $row['amount'], 2);
            $status = (string) $row['payment_status'];

            if ($status === self::PAYMENT_COMPLETED) {
                $out[$id]['recorded'] += $amount;
            } elseif ($status === self::PAYMENT_REFUNDED) {
                $out[$id]['refunded'] += $amount;
            }

            $out[$id]['count']++;
            $out[$id]['events'][] = [
                'payment_id' => (int) $row['payment_id'],
                'date'       => substr((string) $row['paid_on'], 0, 10),
                'amount'     => $amount,
                'status'     => $status,
            ];
        }
        foreach ($out as &$entry) {
            $entry['recorded'] = round($entry['recorded'], 2);
            $entry['refunded'] = round($entry['refunded'], 2);
        }
        return $out;
    }

    /**
     * MotoPress season posts, used for the Season period control.
     *
     * @return array<int,array{id:int,name:string}>
     */
    public static function seasons(): array
    {
        global $wpdb;
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT ID AS id, post_title AS name
                   FROM {$wpdb->posts}
                  WHERE post_type = %s AND post_status = %s
                  ORDER BY post_title",
                'mphb_season',
                'publish'
            ),
            ARRAY_A
        ) ?: [];

        return array_map(
            static fn ($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name']],
            $rows
        );
    }

    /**
     * A season's date range, from MotoPress's own start/end meta.
     *
     * @return array{start:string,end:string}|null
     */
    public static function season_range(int $season_id): ?array
    {
        $start = (string) get_post_meta($season_id, 'mphb_start_date', true);
        $end   = (string) get_post_meta($season_id, 'mphb_end_date', true);
        if (!Dates::is_valid($start) || !Dates::is_valid($end)) {
            return null;
        }
        return ['start' => $start, 'end' => $end];
    }

    public static function admin_link(int $booking_id): string
    {
        return admin_url('post.php?post=' . $booking_id . '&action=edit');
    }
}
