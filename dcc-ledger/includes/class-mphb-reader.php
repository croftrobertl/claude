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

    /**
     * The customer's name, read only to hash the surname and dropped at once.
     *
     * Some MotoPress customers have an empty last name with the whole name in
     * the first-name field, so all three are read and the first one that
     * yields a surname wins. Where none of them does, there is no name to
     * compare and the move signal does not fire — see Copies.
     */
    public const META_LAST_NAME  = 'mphb_last_name';
    public const META_FIRST_NAME = 'mphb_first_name';
    public const META_GUEST_NAME = 'mphb_guest_name';

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
            self::META_LAST_NAME,
            self::META_FIRST_NAME,
            self::META_GUEST_NAME,
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

            // A calendar block, not a stay. The summary text is read here and
            // dropped; only the yes/no travels on.
            $is_block = $is_imported && self::is_block_summary(
                (string) ($m[self::META_ICAL_SUMMARY] ?? ''),
                Money::to_cents($m[self::META_TOTAL] ?? 0)
            );

            $pay = $payments[$id] ?? ['recorded' => 0, 'refunded' => 0, 'count' => 0, 'events' => []];

            // Hashed here, inside the loop. The names themselves go no
            // further than these three local variables.
            $guest_keys = Names::keys_from_parts(
                (string) ($m[self::META_FIRST_NAME] ?? ''),
                (string) ($m[self::META_LAST_NAME] ?? ''),
                (string) ($m[self::META_GUEST_NAME] ?? '')
            );

            $out[] = [
                'id'          => $id,
                'status'      => (string) $row['status'],
                // When the booking row was created in MotoPress. For a
                // walk-in that is the day the guest booked; for one Rob
                // typed in later it is the day he typed it. A floor on the
                // lead time, never a fact about it — labelled as such
                // wherever it is reported.
                'entered_on'  => substr((string) ($row['created'] ?? ''), 0, 10),
                'check_in'    => $row['check_in'] ?: null,
                'check_out'   => $row['check_out'] ?: null,
                'room_id'     => (int) $row['room_id'],
                'cottage'     => $cottage,
                'is_imported' => $is_imported,
                'is_block'    => $is_block,
                'channel'     => $is_imported ? self::channel_from_prodid($prodid) : 'direct',
                'prodid'      => $prodid,
                'codes'       => $codes,
                'note_codes'  => $note_codes,
                'guest_keys'  => $guest_keys,
                'total'       => Money::to_cents($m[self::META_TOTAL] ?? 0),
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
     * What a booking's meta looks like, by key name only.
     *
     * The question this answers is one nobody here can answer from the
     * code: does `mphb_total_price` include tax, a pet fee or other
     * services on THIS site? That depends on how MotoPress is configured,
     * and the ledger must not guess — room revenue excludes tax, and
     * guessing wrong moves every rate.
     *
     * So this reports the shape of the data instead: every meta key that
     * appears on a booking, how many bookings carry it, and whether its
     * values look like money. Key names and counts only — never a value,
     * because a value could be a guest's.
     *
     * @return array<int,array{key:string,bookings:int,money_like:bool,example_shape:string}>
     */
    public static function booking_meta_shape(): array
    {
        global $wpdb;

        try {
            // Key and value together, so "is this a number?" can be decided
            // in PHP — portable SQL only, no REGEXP. The value is looked at
            // inside this loop and never kept: it could be a guest's.
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT m.meta_key AS k, m.meta_value AS v, m.post_id AS p
                       FROM {$wpdb->postmeta} m
                       INNER JOIN {$wpdb->posts} p ON p.ID = m.post_id
                      WHERE p.post_type = %s
                      ORDER BY m.meta_key",
                    self::POST_TYPE_BOOKING
                ),
                ARRAY_A
            ) ?: [];
        } catch (\Throwable $e) {
            error_log('DCCL: booking meta shape query failed');

            return [];
        }

        $keys = [];
        foreach ($rows as $row) {
            $key = (string) $row['k'];
            $keys[$key] ??= ['posts' => [], 'values' => 0, 'numeric' => 0];
            $keys[$key]['posts'][(int) $row['p']] = true;
            $keys[$key]['values']++;
            if (is_numeric(trim((string) $row['v']))) {
                $keys[$key]['numeric']++;
            }
        }
        unset($rows);

        $out = [];
        foreach ($keys as $key => $seen) {
            $out[] = [
                'key'        => $key,
                'bookings'   => count($seen['posts']),
                'money_like' => $seen['values'] > 0 && $seen['numeric'] === $seen['values'],
            ];
        }

        return $out;
    }

    /**
     * Words an OTA writes into an iCal event that is a block rather than a
     * booking — the host closed the dates, or the platform did.
     *
     * Airbnb's wording is the one counted on live: booking 6313 carries
     * "Airbnb (Not available)" with a total of 0. The others are the
     * spellings this plugin recognises if they appear; nobody has shown me a
     * real Vrbo or Booking.com block, so treat them as patterns we accept,
     * not as facts about those feeds. Getting one wrong costs nothing: an
     * unrecognised block is simply raised as a question, the way it was
     * before.
     */
    public const BLOCK_WORDS = ['not available', 'unavailable', 'blocked', 'closed'];

    /**
     * Is this imported event a block?
     *
     * Both halves must hold. The wording alone is not enough — a guest can
     * put any word in a booking — so a block must also carry no money. That
     * way a real reservation is never quietly demoted to a calendar note.
     */
    public static function is_block_summary(string $summary, int $total_cents): bool
    {
        if ($total_cents !== 0 || $summary === '') {
            return false;
        }
        $haystack = strtolower($summary);
        foreach (self::BLOCK_WORDS as $word) {
            if (strpos($haystack, $word) !== false) {
                return true;
            }
        }
        return false;
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
     * Every figure is whole cents.
     *
     * @return array<int,array{recorded:int,refunded:int,count:int,events:array<int,array<string,mixed>>}>
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
            $out[$id] ??= ['recorded' => 0, 'refunded' => 0, 'count' => 0, 'events' => []];
            // Parsed from the stored string, never multiplied as a float.
            $amount = Money::to_cents($row['amount']);
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
