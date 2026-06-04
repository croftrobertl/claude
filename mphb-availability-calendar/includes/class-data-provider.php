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
     * MotoPress booking post statuses that occupy a room. A "confirmed" booking
     * is a real reservation (iCal imports also land as confirmed); "pending" is
     * a checkout in progress that holds the room. Cancelled/abandoned do not.
     */
    private const BLOCKING_STATUSES = ['confirmed', 'pending', 'pending-payment'];

    /**
     * @param int[]             $room_type_ids
     * @return array<int, array<string,string>>
     */
    private static function query_availability(array $room_type_ids, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $today = self::today();

        // Map every physical room of every requested cottage type.
        $rooms_of_type = [];   // type_id => int[]
        $type_of_room  = [];   // room_id => type_id
        foreach ($room_type_ids as $type_id) {
            $rooms_of_type[$type_id] = self::room_ids_for_type($type_id);
            foreach ($rooms_of_type[$type_id] as $rid) {
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

        try {
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
                      AND co.meta_value > %s
                    ORDER BY rr.ID";
            $params = array_merge(self::BLOCKING_STATUSES, $room_ids, [$to_str, $from_str]);
            $rows   = $wpdb->get_results($wpdb->prepare($sql, $params));
            foreach ((array) $rows as $row) {
                // A reservation occupies nights [check_in, check_out); checkout day is free.
                self::mark_days($occupied, (int) $row->room_id, (string) $row->checkin, (string) $row->checkout, false, $from, $to);
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC: reservation query failed: ' . $e->getMessage());
        }

        try {
            $blocks_table = $wpdb->prefix . 'mphb_blocks';
            $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($blocks_table)));
            if ($exists === $blocks_table) {
                $sql2 = "SELECT room_id, date_from, date_to FROM $blocks_table
                         WHERE not_stay_in = 1
                           AND room_id IN ($room_ph)
                           AND date_to >= %s AND date_from <= %s";
                $params2 = array_merge($room_ids, [$from_str, $to_str]);
                $rows2   = $wpdb->get_results($wpdb->prepare($sql2, $params2));
                foreach ((array) $rows2 as $row) {
                    // Host blocks span [date_from, date_to] inclusive on both ends.
                    self::mark_days($occupied, (int) $row->room_id, (string) $row->date_from, (string) $row->date_to, true, $from, $to);
                }
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC: blocks query failed: ' . $e->getMessage());
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
