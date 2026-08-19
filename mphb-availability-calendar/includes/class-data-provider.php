<?php
namespace MPHBAC;

use DateTimeImmutable;
use DateTimeZone;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Signals that a $wpdb read inside the availability producer failed, so the
 * result must not be cached or trusted. Internal to Data_Provider.
 */
final class Db_Read_Failed extends \RuntimeException
{
}

final class Data_Provider
{
    public const TZ        = 'America/New_York';
    public const ST_AVAIL  = 'available';
    public const ST_BOOKED = 'booked';
    public const ST_PAST   = 'past';

    public static function timezone(): DateTimeZone
    {
        return new DateTimeZone(self::TZ);
    }

    public static function today(): DateTimeImmutable
    {
        return (new DateTimeImmutable('now', self::timezone()))->setTime(0, 0, 0);
    }

    /**
     * List all MotoPress accommodation types.
     *
     * @return array<int, array{id:int,title:string,abbrev:string,number:string}>
     */
    public static function list_room_types(): array
    {
        return Cache::get_or_set(
            Cache::key(['room_types_v1']),
            static fn(): array => self::query_room_types(),
            HOUR_IN_SECONDS
        );
    }

    /**
     * @return array<int, array{id:int,title:string,abbrev:string,number:string}>
     */
    private static function query_room_types(): array
    {
        $types = [];

        try {
            if (function_exists('MPHB')) {
                $mphb = \MPHB();
                if (is_object($mphb) && method_exists($mphb, 'getRoomTypeRepository')) {
                    $repo = $mphb->getRoomTypeRepository();
                    if (is_object($repo) && method_exists($repo, 'findAll')) {
                        $items = $repo->findAll(['posts_per_page' => -1]);
                        foreach ((array) $items as $item) {
                            $id    = is_object($item) && method_exists($item, 'getId') ? (int) $item->getId() : 0;
                            $title = is_object($item) && method_exists($item, 'getTitle') ? (string) $item->getTitle() : '';
                            if ($id > 0) {
                                $types[] = self::normalize_room_type($id, $title);
                            }
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC: list_room_types failed via MPHB() API: ' . $e->getMessage());
            $types = [];
        }

        if (empty($types)) {
            $posts = get_posts([
                'post_type'      => 'mphb_room_type',
                'posts_per_page' => -1,
                'post_status'    => 'publish',
                'orderby'        => 'title',
                'order'          => 'ASC',
                'no_found_rows'  => true,
            ]);
            foreach ($posts as $post) {
                $types[] = self::normalize_room_type((int) $post->ID, (string) $post->post_title);
            }
        }

        return $types;
    }

    /**
     * @return array{id:int,title:string,abbrev:string,number:string}
     */
    private static function normalize_room_type(int $id, string $title): array
    {
        $number = '';
        $abbrev = $title;
        if (preg_match('/^\s*Cottage\s+(\d+)\s*:\s*(.+)$/i', $title, $m) === 1) {
            $number = $m[1];
            $abbrev = trim($m[2]);
        }
        $words = array_values(array_filter(preg_split('/\s+/', $abbrev) ?: []));
        $articles = ['the', 'a', 'an'];
        $picked = $abbrev;
        foreach ($words as $word) {
            if (!in_array(strtolower($word), $articles, true)) {
                $picked = $word;
                break;
            }
        }
        $abbrev = mb_substr((string) $picked, 0, 12);

        return [
            'id'     => $id,
            'title'  => $title,
            'abbrev' => $abbrev,
            'number' => $number,
        ];
    }

    /**
     * Returns availability for each requested room type across the given date range.
     *
     * @param int[]             $room_type_ids
     * @param DateTimeImmutable $from inclusive, midnight ET
     * @param DateTimeImmutable $to   inclusive, midnight ET
     * @return array<int, array<string,string>> [ room_type_id => [ 'YYYY-MM-DD' => status ] ]
     */
    public static function get_availability(array $room_type_ids, DateTimeImmutable $from, DateTimeImmutable $to, ?int &$age = null, ?bool &$hit = null): array
    {
        $age = 0;
        $hit = false;
        $room_type_ids = array_values(array_unique(array_map('intval', $room_type_ids)));
        // Canonical order: the ID list is salted into the cache key, so sorting
        // makes [1065,1067] and [1067,1065] share one transient — and gives the
        // result map a deterministic key order, which the client relies on to
        // byte-compare the page-embedded payload against the AJAX revalidate.
        sort($room_type_ids);
        if (empty($room_type_ids) || $from > $to) {
            return [];
        }

        $cache_key = Cache::key([
            'avail_v2',
            $room_type_ids,
            $from->format('Y-m-d'),
            $to->format('Y-m-d'),
            // Salt with today's date (ET): "past" is baked into the stored
            // payload, so without this a window cached at 23:50 still serves
            // yesterday-as-available for up to 15 min after midnight. A new
            // day = a new key = a fresh compute; the old entry just expires.
            self::today()->format('Y-m-d'),
        ]);

        try {
            return Cache::get_or_set(
                $cache_key,
                static fn(): array => self::query_availability_checked($room_type_ids, $from, $to),
                Cache::DEFAULT_TTL,
                $age,
                $hit
            );
        } catch (Db_Read_Failed $e) {
            // A DB read failed mid-compute. Nothing was cached (get_or_set
            // only stores what the producer returns), so the next request
            // retries. Return the safe direction — an empty map renders as
            // fully booked, never as falsely available.
            $age = 0;
            $hit = false;
            return [];
        }
    }

    /**
     * Runs query_availability() and throws if any underlying $wpdb read
     * failed. wpdb never throws on SQL errors — it sets $wpdb->last_error and
     * returns an empty set, which is indistinguishable from "no bookings".
     * Uncaught, that would CACHE an all-available (or all-booked) lie for the
     * full TTL. The throw makes get_or_set skip the cache write.
     */
    private static function query_availability_checked(array $room_type_ids, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        self::$db_error = false;
        $result = self::query_availability($room_type_ids, $from, $to);
        if (self::$db_error) {
            throw new Db_Read_Failed('availability DB read failed');
        }
        return $result;
    }

    /** Set by the low-level query helpers when $wpdb reports an error. */
    private static bool $db_error = false;

    /**
     * MotoPress booking post statuses that occupy a room. A "confirmed" booking
     * is a real reservation (iCal imports also land as confirmed); "pending" is
     * a checkout in progress that holds the room; "pending-user" is the hold
     * MotoPress places when its confirmation mode is set to email-confirmation
     * (not the site's current mode, but included so a settings change can't
     * silently show held rooms as available). Cancelled/abandoned do not block.
     */
    private const BLOCKING_STATUSES = ['confirmed', 'pending', 'pending-user', 'pending-payment'];

    /**
     * Cap for the forward "next availability" scan used by the all-booked hint.
     * One year is a generous ceiling — properties booked solid for >365 days
     * fall back to a null result and the client uses its last-visible-day
     * heuristic. Keeps the SQL footprint bounded.
     */
    public const FORWARD_SCAN_MAX_DAYS = 365;

    /**
     * First day on or after $start where any of the requested cottage types is
     * available. Returns null if nothing's available within $max_days.
     *
     * Backs the "All cottages booked through {date}" hint when the user is
     * viewing a window where every visible day is booked — without this scan,
     * the hint can only point to the last visible day, which understates the
     * real through-date when the booked stretch extends beyond the window.
     */
    public static function find_first_availability(array $room_type_ids, DateTimeImmutable $start, int $max_days = self::FORWARD_SCAN_MAX_DAYS): ?DateTimeImmutable
    {
        $room_type_ids = array_values(array_unique(array_map('intval', $room_type_ids)));
        if (empty($room_type_ids) || $max_days <= 0) {
            return null;
        }
        $end = $start->modify('+' . max(1, $max_days) . ' days');
        $availability = self::get_availability($room_type_ids, $start, $end);
        $cursor = $start;
        while ($cursor <= $end) {
            $date = $cursor->format('Y-m-d');
            foreach ($room_type_ids as $type_id) {
                if (($availability[$type_id][$date] ?? '') === self::ST_AVAIL) {
                    return $cursor;
                }
            }
            $cursor = $cursor->modify('+1 day');
        }
        return null;
    }

    /**
     * @param int[]             $room_type_ids
     * @return array<int, array<string,string>>
     */
    private static function query_availability(array $room_type_ids, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $today = self::today();

        // Map every physical room of every requested cottage type — one query
        // for all types, not one per type.
        $rooms_of_type = self::rooms_for_types($room_type_ids);
        $type_of_room  = [];   // room_id => type_id
        foreach ($rooms_of_type as $type_id => $rids) {
            foreach ($rids as $rid) {
                $type_of_room[$rid] = $type_id;
            }
        }

        // occupied[type_id][date] = [room_id => true]
        $occupied = [];
        $room_days = self::query_occupied_room_days(array_keys($type_of_room), $from, $to);
        foreach ($room_days as $rid => $days) {
            $type_id = $type_of_room[$rid] ?? 0;
            if ($type_id === 0) {
                continue;
            }
            foreach ($days as $date => $_) {
                $occupied[$type_id][$date][$rid] = true;
            }
        }

        $result = [];
        foreach ($room_type_ids as $type_id) {
            $room_count = count($rooms_of_type[$type_id]);
            $result[$type_id] = [];
            $cursor = $from;
            while ($cursor <= $to) {
                $date = $cursor->format('Y-m-d');
                if ($cursor < $today) {
                    $result[$type_id][$date] = self::ST_PAST;
                } elseif ($room_count === 0) {
                    $result[$type_id][$date] = self::ST_BOOKED;
                } else {
                    $occ = isset($occupied[$type_id][$date]) ? count($occupied[$type_id][$date]) : 0;
                    $result[$type_id][$date] = ($occ >= $room_count) ? self::ST_BOOKED : self::ST_AVAIL;
                }
                $cursor = $cursor->modify('+1 day');
            }
        }

        return $result;
    }

    /** Per-request memo for rooms_for_types(): type_id => int[] room IDs. */
    private static array $room_cache = [];

    /**
     * Resolve the physical rooms of every requested cottage type in ONE query.
     *
     * This previously ran a separate WP_Query meta lookup per type — 8 queries
     * per availability cache-miss on this site, each carrying full WP_Query
     * overhead. One IN() query returns the same mapping.
     *
     * @param int[] $room_type_ids
     * @return array<int,int[]> type_id => room IDs (every requested type is present)
     */
    private static function rooms_for_types(array $room_type_ids): array
    {
        global $wpdb;

        $out     = [];
        $missing = [];
        foreach ($room_type_ids as $type_id) {
            if (isset(self::$room_cache[$type_id])) {
                $out[$type_id] = self::$room_cache[$type_id];
            } else {
                $out[$type_id] = [];
                $missing[]     = $type_id;
            }
        }
        if (empty($missing)) {
            return $out;
        }

        $ph  = implode(',', array_fill(0, count($missing), '%d'));
        $sql = "SELECT pm.meta_value AS type_id, p.ID AS room_id
                FROM {$wpdb->posts} p
                INNER JOIN {$wpdb->postmeta} pm
                    ON pm.post_id = p.ID AND pm.meta_key = 'mphb_room_type_id'
                WHERE p.post_type = 'mphb_room'
                  AND p.post_status = 'publish'
                  AND CAST(pm.meta_value AS UNSIGNED) IN ($ph)";
        $rows = $wpdb->get_results($wpdb->prepare($sql, $missing));

        // wpdb does not throw on SQL errors — it sets last_error and returns
        // an empty set, indistinguishable from "type has no rooms". A failed
        // read must NOT be memoized (a zero-room type renders every day as
        // booked for the rest of the request) and must flag the whole compute
        // as untrustworthy so it is never written to the transient.
        if ($wpdb->last_error !== '') {
            error_log('MPHBAC: rooms_for_types query failed: ' . $wpdb->last_error);
            self::$db_error = true;
            foreach ($missing as $type_id) {
                $out[$type_id] = [];
            }
            return $out;
        }

        $found = [];
        foreach ($missing as $type_id) {
            $found[$type_id] = [];
        }
        foreach ((array) $rows as $row) {
            $type_id = (int) $row->type_id;
            if (isset($found[$type_id])) {
                $found[$type_id][] = (int) $row->room_id;
            }
        }
        // Successful read: memoize, including genuinely room-less types.
        foreach ($found as $type_id => $rids) {
            self::$room_cache[$type_id] = $rids;
            $out[$type_id]              = $rids;
        }
        return $out;
    }

    /**
     * Which calendar days each physical room is occupied across the range.
     * Reads MotoPress's real storage directly (verified against MotoPress 6.x):
     *   - Reservations: mphb_reserved_room posts (_mphb_room_id meta) whose
     *     parent mphb_booking post is in a blocking status. The check-in /
     *     check-out dates live on the PARENT booking. Covers direct bookings
     *     and iCal-imported bookings alike (both stored as mphb_booking).
     *   - Manual host blocks: {$prefix}mphb_blocks rows with not_stay_in = 1.
     *
     * @param int[] $room_ids
     * @return array<int, array<string,bool>> [ room_id => [ 'YYYY-MM-DD' => true ] ]
     */
    private static function query_occupied_room_days(array $room_ids, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        global $wpdb;

        $occupied = [];
        $room_ids = array_values(array_unique(array_map('intval', $room_ids)));
        if (empty($room_ids)) {
            return $occupied;
        }

        $from_str   = $from->format('Y-m-d');
        $to_str     = $to->format('Y-m-d');
        $room_ph    = implode(',', array_fill(0, count($room_ids), '%d'));

        // Error handling note: wpdb never throws — a failed query sets
        // $wpdb->last_error and returns empty, which here would silently mean
        // "no reservations" and cache every booked day as available for the
        // full TTL. Each read is therefore checked via last_error and flags
        // self::$db_error so the compute is discarded instead of cached.
        $status_ph = implode(',', array_fill(0, count(self::BLOCKING_STATUSES), '%s'));
        $sql = "SELECT rid.meta_value AS room_id, ci.meta_value AS checkin, co.meta_value AS checkout
                FROM {$wpdb->posts} rr
                INNER JOIN {$wpdb->postmeta} rid ON rid.post_id = rr.ID AND rid.meta_key = '_mphb_room_id'
                INNER JOIN {$wpdb->posts} bk ON bk.ID = rr.post_parent AND bk.post_type = 'mphb_booking'
                INNER JOIN {$wpdb->postmeta} ci ON ci.post_id = bk.ID AND ci.meta_key = 'mphb_check_in_date'
                INNER JOIN {$wpdb->postmeta} co ON co.post_id = bk.ID AND co.meta_key = 'mphb_check_out_date'
                WHERE rr.post_type = 'mphb_reserved_room'
                  AND bk.post_status IN ($status_ph)
                  AND CAST(rid.meta_value AS UNSIGNED) IN ($room_ph)
                  AND ci.meta_value <= %s
                  AND co.meta_value > %s";
        // No ORDER BY: results are folded into a keyed map, so ordering is
        // irrelevant — and sorting them only added a filesort.
        $params = array_merge(self::BLOCKING_STATUSES, $room_ids, [$to_str, $from_str]);
        $rows   = $wpdb->get_results($wpdb->prepare($sql, $params));
        if ($wpdb->last_error !== '') {
            error_log('MPHBAC: reservation query failed: ' . $wpdb->last_error);
            self::$db_error = true;
        } else {
            foreach ((array) $rows as $row) {
                // A reservation occupies nights [check_in, check_out); checkout day is free.
                self::mark_days($occupied, (int) $row->room_id, (string) $row->checkin, (string) $row->checkout, false, $from, $to);
            }
        }

        $blocks_table = $wpdb->prefix . 'mphb_blocks';
        $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($blocks_table)));
        if ($exists === $blocks_table) {
            $sql2 = "SELECT room_id, date_from, date_to FROM $blocks_table
                     WHERE not_stay_in = 1
                       AND room_id IN ($room_ph)
                       AND date_to >= %s AND date_from <= %s";
            $params2 = array_merge($room_ids, [$from_str, $to_str]);
            $rows2   = $wpdb->get_results($wpdb->prepare($sql2, $params2));
            if ($wpdb->last_error !== '') {
                error_log('MPHBAC: blocks query failed: ' . $wpdb->last_error);
                self::$db_error = true;
            } else {
                foreach ((array) $rows2 as $row) {
                    // Host blocks span [date_from, date_to] inclusive on both ends.
                    self::mark_days($occupied, (int) $row->room_id, (string) $row->date_from, (string) $row->date_to, true, $from, $to);
                }
            }
        }

        return $occupied;
    }

    /**
     * Mark a room occupied for each day a reservation/block covers, clamped to
     * the visible range. $inclusive_end true => the end date itself is occupied
     * (host blocks); false => end date is exclusive (reservation checkout day).
     *
     * @param array<int,array<string,bool>> $occupied
     */
    private static function mark_days(array &$occupied, int $room_id, string $start_str, string $end_str, bool $inclusive_end, DateTimeImmutable $from, DateTimeImmutable $to): void
    {
        if ($room_id <= 0 || $start_str === '' || $end_str === '') {
            return;
        }
        try {
            $tz    = self::timezone();
            $start = new DateTimeImmutable(max($start_str, $from->format('Y-m-d')), $tz);
            $end   = new DateTimeImmutable($end_str, $tz);
            $range_end = $inclusive_end ? $to : $to->modify('+1 day');
            if ($end > $range_end) {
                $end = $range_end;
            }
        } catch (\Throwable $e) {
            return;
        }
        $cursor = $start;
        while ($inclusive_end ? $cursor <= $end : $cursor < $end) {
            $occupied[$room_id][$cursor->format('Y-m-d')] = true;
            $cursor = $cursor->modify('+1 day');
        }
    }
}
