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
        $first_word = preg_split('/\s+/', $abbrev)[0] ?? $abbrev;
        $abbrev = mb_substr((string) $first_word, 0, 12);

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

        // Walk the range one day at a time but only via the in-memory helper —
        // MotoPress's helper reads from its own preloaded data, so this is O(n)
        // in days but stays in PHP. Acceptable for n ≤ 95.
        $blocked = [];
        $cursor  = $from;
        while ($cursor <= $to) {
            $checkin  = $cursor->format('Y-m-d');
            $checkout = $cursor->modify('+1 day')->format('Y-m-d');
            $rooms    = $helper->getAvailableRooms($checkin, $checkout, ['room_type_id' => $room_type_id]);
            if (empty($rooms)) {
                $blocked[$checkin] = true;
            }
            $cursor = $cursor->modify('+1 day');
        }
        return $blocked;
    }

    /**
     * @return object|null
     */
    private static function resolve_availability_helper(object $mphb)
    {
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
     * Single batched query against MotoPress booking tables for the whole range.
     *
     * @return array<string,bool>
     */
    private static function query_blocked_via_sql(int $room_type_id, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        global $wpdb;

        $rooms_of_type = get_posts([
            'post_type'      => 'mphb_room',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'meta_query'     => [
                [
                    'key'     => 'mphb_room_type_id',
                    'value'   => $room_type_id,
                    'compare' => '=',
                ],
            ],
            'fields'         => 'ids',
            'no_found_rows'  => true,
        ]);
        $rooms_of_type = array_map('intval', (array) $rooms_of_type);
        if (empty($rooms_of_type)) {
            // No physical rooms configured for this type — every day is "blocked".
            return self::date_range_as_blocked($from, $to);
        }

        $booking_dates_table = $wpdb->prefix . 'mphb_booking_dates';
        $tables = $wpdb->get_col(
            $wpdb->prepare(
                "SHOW TABLES LIKE %s",
                $wpdb->esc_like($wpdb->prefix . 'mphb_') . '%'
            )
        );
        if (!in_array($booking_dates_table, (array) $tables, true)) {
            // Can't determine — fail safe to "all blocked" rather than show false availability.
            return self::date_range_as_blocked($from, $to);
        }

        $placeholders = implode(',', array_fill(0, count($rooms_of_type), '%d'));
        $sql = "SELECT DISTINCT date FROM {$booking_dates_table}
                WHERE room_id IN ($placeholders)
                  AND date >= %s AND date <= %s";
        $params = array_merge($rooms_of_type, [$from->format('Y-m-d'), $to->format('Y-m-d')]);

        $dates = $wpdb->get_col($wpdb->prepare($sql, $params));

        $blocked = [];
        foreach ((array) $dates as $d) {
            $blocked[(string) $d] = true;
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
