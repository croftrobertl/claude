<?php
namespace MPHBAC;

use DateTimeImmutable;
use DateTimeZone;

if (!defined('ABSPATH')) {
    exit;
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
    public static function get_availability(array $room_type_ids, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $room_type_ids = array_values(array_unique(array_map('intval', $room_type_ids)));
        if (empty($room_type_ids) || $from > $to) {
            return [];
        }

        $cache_key = Cache::key([
            'avail_v1',
            $room_type_ids,
            $from->format('Y-m-d'),
            $to->format('Y-m-d'),
        ]);

        return Cache::get_or_set(
            $cache_key,
            static fn(): array => self::query_availability($room_type_ids, $from, $to),
            Cache::DEFAULT_TTL
        );
    }

    /**
     * @param int[]             $room_type_ids
     * @return array<int, array<string,string>>
     */
    private static function query_availability(array $room_type_ids, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $today  = self::today();
        $result = [];

        foreach ($room_type_ids as $type_id) {
            $blocked = self::get_blocked_dates_for_type($type_id, $from, $to);
            $result[$type_id] = [];
            $cursor = $from;
            while ($cursor <= $to) {
                $date_str = $cursor->format('Y-m-d');
                if ($cursor < $today) {
                    $result[$type_id][$date_str] = self::ST_PAST;
                } elseif (isset($blocked[$date_str])) {
                    $result[$type_id][$date_str] = self::ST_BOOKED;
                } else {
                    $result[$type_id][$date_str] = self::ST_AVAIL;
                }
                $cursor = $cursor->modify('+1 day');
            }
        }

        return $result;
    }

    /**
     * Returns the set of blocked dates (booked or host-blocked) for a room type
     * across the given range. Keyed by 'YYYY-MM-DD' => true for O(1) lookup.
     *
     * @return array<string,bool>
     */
    private static function get_blocked_dates_for_type(int $room_type_id, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        try {
            $api_result = self::query_blocked_via_mphb_api($room_type_id, $from, $to);
            if ($api_result !== null) {
                return $api_result;
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC: blocked-dates API path failed for type ' . $room_type_id . ': ' . $e->getMessage());
        }

        return self::query_blocked_via_sql($room_type_id, $from, $to);
    }

    /**
     * @return array<string,bool>|null Null if MotoPress's API surface isn't available; caller should fall back.
     */
    private static function query_blocked_via_mphb_api(int $room_type_id, DateTimeImmutable $from, DateTimeImmutable $to): ?array
    {
        if (!function_exists('MPHB')) {
            return null;
        }
        $mphb = \MPHB();
        if (!is_object($mphb)) {
            return null;
        }

        $helper = self::resolve_availability_helper($mphb);
        if ($helper === null) {
            return null;
        }

        $rooms_of_type = self::room_ids_for_type($room_type_id);
        if (empty($rooms_of_type)) {
            return self::date_range_as_blocked($from, $to);
        }

        // MotoPress's getAvailableRooms can ignore or misinterpret the
        // room_type_id filter argument across versions, so we always
        // post-filter the result against our known set of room IDs.
        $blocked = [];
        $cursor  = $from;
        while ($cursor <= $to) {
            $checkin  = $cursor->format('Y-m-d');
            $checkout = $cursor->modify('+1 day')->format('Y-m-d');
            $rooms    = $helper->getAvailableRooms($checkin, $checkout, ['room_type_id' => $room_type_id]);

            $available_in_type = 0;
            foreach ((array) $rooms as $room) {
                $rid = self::extract_room_id($room);
                if ($rid > 0 && in_array($rid, $rooms_of_type, true)) {
                    $available_in_type++;
                }
            }
            if ($available_in_type === 0) {
                $blocked[$checkin] = true;
            }
            $cursor = $cursor->modify('+1 day');
        }
        return $blocked;
    }

    /**
     * @return int[]
     */
    private static function room_ids_for_type(int $room_type_id): array
    {
        static $cache = [];
        if (isset($cache[$room_type_id])) {
            return $cache[$room_type_id];
        }
        $ids = get_posts([
            'post_type'      => 'mphb_room',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'meta_query'     => [
                ['key' => 'mphb_room_type_id', 'value' => $room_type_id, 'compare' => '='],
            ],
            'fields'         => 'ids',
            'no_found_rows'  => true,
        ]);
        return $cache[$room_type_id] = array_map('intval', (array) $ids);
    }

    /**
     * Extract a room ID from whatever shape MotoPress returns (entity object,
     * associative array, or bare int/string).
     *
     * @param mixed $room
     */
    private static function extract_room_id($room): int
    {
        if (is_object($room)) {
            if (method_exists($room, 'getId'))     return (int) $room->getId();
            if (method_exists($room, 'getRoomId')) return (int) $room->getRoomId();
            if (isset($room->ID))                  return (int) $room->ID;
            if (isset($room->id))                  return (int) $room->id;
        }
        if (is_array($room)) {
            return (int) ($room['id'] ?? $room['ID'] ?? $room['room_id'] ?? 0);
        }
        return (int) $room;
    }

    /**
     * @return object|null A repository/helper that exposes getAvailableRooms($checkin, $checkout, ['room_type_id' => int]).
     */
    private static function resolve_availability_helper(object $mphb)
    {
        // Newer MotoPress (≥6.x): the method lives on getRoomRepository().
        if (method_exists($mphb, 'getRoomRepository')) {
            $repo = $mphb->getRoomRepository();
            if (is_object($repo) && method_exists($repo, 'getAvailableRooms')) {
                return $repo;
            }
        }
        // Older MotoPress: the method was on a dedicated helper hung off MPHB().
        foreach (['getRoomAvailabilityHelper', 'getAvailabilityHelper'] as $method) {
            if (method_exists($mphb, $method)) {
                $helper = $mphb->{$method}();
                if (is_object($helper) && method_exists($helper, 'getAvailableRooms')) {
                    return $helper;
                }
            }
        }
        return null;
    }

    /**
     * SQL fallback for when MotoPress's API path is unavailable.
     * Combines two sources:
     *   1. Manual / iCal-imported blocks in {$prefix}mphb_blocks
     *   2. Actual reservations stored as mphb_reserved_room post types
     * A day is "blocked" only when every room of the type is unavailable that day.
     *
     * @return array<string,bool>
     */
    private static function query_blocked_via_sql(int $room_type_id, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        global $wpdb;

        $rooms_of_type = self::room_ids_for_type($room_type_id);
        if (empty($rooms_of_type)) {
            return self::date_range_as_blocked($from, $to);
        }

        $blocks_table = $wpdb->prefix . 'mphb_blocks';
        $from_str = $from->format('Y-m-d');
        $to_str   = $to->format('Y-m-d');

        $unavailable_per_room_per_day = [];
        $type_wide_blocked_days       = [];

        $tables = $wpdb->get_col(
            $wpdb->prepare("SHOW TABLES LIKE %s", $wpdb->esc_like($blocks_table))
        );
        if (in_array($blocks_table, (array) $tables, true)) {
            $room_placeholders = implode(',', array_fill(0, count($rooms_of_type), '%d'));
            $sql = "SELECT room_type_id, room_id, date_from, date_to, not_stay_in
                    FROM $blocks_table
                    WHERE (room_type_id = %d OR room_id IN ($room_placeholders))
                      AND not_stay_in = 1
                      AND date_to >= %s
                      AND date_from <= %s";
            $params = array_merge([$room_type_id], $rooms_of_type, [$from_str, $to_str]);
            $rows   = $wpdb->get_results($wpdb->prepare($sql, $params));
            foreach ((array) $rows as $row) {
                $start = max($row->date_from, $from_str);
                $end   = min($row->date_to, $to_str);
                $cursor = new DateTimeImmutable($start, self::timezone());
                $end_dt = new DateTimeImmutable($end, self::timezone());
                while ($cursor <= $end_dt) {
                    $d = $cursor->format('Y-m-d');
                    if ((int) $row->room_id === 0) {
                        $type_wide_blocked_days[$d] = true;
                    } else {
                        $unavailable_per_room_per_day[$d][(int) $row->room_id] = true;
                    }
                    $cursor = $cursor->modify('+1 day');
                }
            }
        }

        // mphb_reserved_room posts: actual reservations.
        $reserved_posts = $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, ci.meta_value AS checkin, co.meta_value AS checkout, rid.meta_value AS room_id
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} ci  ON ci.post_id = p.ID  AND ci.meta_key = 'mphb_check_in_date'
             INNER JOIN {$wpdb->postmeta} co  ON co.post_id = p.ID  AND co.meta_key = 'mphb_check_out_date'
             INNER JOIN {$wpdb->postmeta} rid ON rid.post_id = p.ID AND rid.meta_key = 'mphb_room_id'
             WHERE p.post_type = 'mphb_reserved_room'
               AND p.post_status IN ('publish', 'mphbrr_reserved')
               AND ci.meta_value <= %s
               AND co.meta_value > %s",
            $to_str,
            $from_str
        ));
        foreach ((array) $reserved_posts as $row) {
            $rid = (int) $row->room_id;
            if (!in_array($rid, $rooms_of_type, true)) {
                continue;
            }
            // Reservation occupies nights [check_in, check_out) — checkout day is free.
            $start = max($row->checkin, $from_str);
            $end_excl = min($row->checkout, $to->modify('+1 day')->format('Y-m-d'));
            $cursor = new DateTimeImmutable($start, self::timezone());
            $end_dt = new DateTimeImmutable($end_excl, self::timezone());
            while ($cursor < $end_dt) {
                $unavailable_per_room_per_day[$cursor->format('Y-m-d')][$rid] = true;
                $cursor = $cursor->modify('+1 day');
            }
        }

        $room_count = count($rooms_of_type);
        $blocked    = $type_wide_blocked_days;
        foreach ($unavailable_per_room_per_day as $date => $room_map) {
            if (count($room_map) >= $room_count) {
                $blocked[$date] = true;
            }
        }
        return $blocked;
    }

    /**
     * @return array<string,bool>
     */
    private static function date_range_as_blocked(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $blocked = [];
        $cursor  = $from;
        while ($cursor <= $to) {
            $blocked[$cursor->format('Y-m-d')] = true;
            $cursor = $cursor->modify('+1 day');
        }
        return $blocked;
    }
}
