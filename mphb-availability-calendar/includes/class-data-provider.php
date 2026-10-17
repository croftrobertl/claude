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
        $abbrev = self::short_name($abbrev);

        return [
            'id'     => $id,
            'title'  => $title,
            'abbrev' => $abbrev,
            'number' => $number,
        ];
    }

    /**
     * The short name shown in the cottage column.
     *
     * Rule: drop a leading article, then drop TRAILING generic accommodation
     * nouns while more than one word remains. Everything else is kept.
     *
     *   "Cottage 22: The Boathouse"       -> Boathouse
     *   "Cottage 31: Hibiscus Hut"        -> Hibiscus
     *   "Cottage 35: Blue Heron Hideaway" -> Blue Heron
     *
     * Until 0.23.5 this took the FIRST non-article word and stopped, which
     * turned "Blue Heron Hideaway" into "Blue" — a name that means nothing to
     * a guest. The single-word guard is what keeps "The Boathouse" from being
     * reduced to nothing when the only word left is itself a generic noun.
     */
    private static function short_name(string $name): string
    {
        $words = array_values(array_filter(preg_split('/\s+/', $name) ?: [], static fn($w) => $w !== ''));
        if (!$words) {
            return '';
        }
        $articles = ['the', 'a', 'an'];
        if (count($words) > 1 && in_array(strtolower($words[0]), $articles, true)) {
            array_shift($words);
        }
        /** Generic nouns that add nothing once the distinctive part is shown. */
        $generic = (array) apply_filters('mphbac_generic_room_words', [
            'cottage', 'hut', 'bungalow', 'place', 'suite', 'hideaway', 'house',
            'cabin', 'lodge', 'retreat', 'villa', 'room', 'unit', 'inn',
            'apartment', 'studio', 'chalet', 'bunkhouse',
        ]);
        $generic = array_map('strtolower', array_map('strval', $generic));
        while (count($words) > 1 && in_array(strtolower(rtrim(end($words), '.,')), $generic, true)) {
            array_pop($words);
        }
        $out = implode(' ', $words);

        // Cap the length, but never mid-word — a cut like "Morning Glor" reads
        // as a bug. The eight live cottages are all well inside this.
        $limit = 16;
        if (mb_strlen($out) > $limit) {
            $cut = mb_substr($out, 0, $limit);
            $sp  = mb_strrpos($cut, ' ');
            $out = ($sp !== false && $sp > 0) ? mb_substr($cut, 0, $sp) : $cut;
        }
        return $out;
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
        // Canonical order: gives the result map a deterministic key order,
        // which the client relies on to byte-compare the page-embedded
        // payload against the AJAX revalidate.
        sort($room_type_ids);
        if (empty($room_type_ids) || $from > $to) {
            return [];
        }

        // ONE CACHE ENTRY PER CALENDAR MONTH, NOT PER REQUEST (0.47.3, the
        // WD's audit). Until 0.47.2 the key was the request itself — the
        // type list, from and to — so every distinct window a script asked
        // the public, nonce-free endpoint for minted its own options-table
        // row (Ajax::handle() clamps the dates, but within ~3 years there are
        // still hundreds of thousands of windows). Now a month's map for every
        // listed cottage is stored once, and any request is cut from the
        // months it spans. The number of rows is fixed by the calendar: one
        // per month that can be asked for (about four years of months),
        // per day — "today" is in the key, below — whatever is requested.
        //
        // TTL 0 ("do not cache") stores nothing: the window is read straight.
        if (Cache::ttl() <= 0) {
            try {
                return self::query_availability_checked($room_type_ids, $from, $to);
            } catch (Db_Read_Failed $e) {
                return [];
            }
        }

        // Every listed cottage is in every month's entry — so a one-cottage
        // request and an all-cottage request share it — plus any id a caller
        // passed that the list lacks (never from the public endpoint, which
        // accepts listed ids only).
        $type_set = array_map(static fn($t) => (int) $t['id'], self::list_room_types());
        $type_set = array_values(array_unique(array_merge($type_set, $room_type_ids)));
        sort($type_set);
        // Salt with today's date (ET): "past" is baked into the stored
        // payload, so without this a month cached at 23:50 still serves
        // yesterday-as-available after midnight. A new day = new keys; the
        // old entries just expire.
        $today_key = self::today()->format('Y-m-d');

        $months = [];
        for ($m = $from->modify('first day of this month'); $m <= $to; $m = $m->modify('first day of next month')) {
            $months[] = $m->format('Y-m');
        }
        $have = [];
        $missing = [];
        foreach ($months as $ym) {
            $key = Cache::key(['avail_m1', $type_set, $ym, $today_key]);
            $got = Cache::peek($key, $a);
            if (is_array($got)) {
                $have[$ym] = $got;
                $age = max($age, (int) $a);
            } else {
                $missing[$ym] = $key;
            }
        }
        if ($missing) {
            $tz    = self::timezone();
            $first = array_key_first($missing);
            $last  = array_key_last($missing);
            $span_from = new DateTimeImmutable($first . '-01', $tz);
            $span_to   = (new DateTimeImmutable($last . '-01', $tz))->modify('last day of this month');
            try {
                self::$rules_failed = false;
                $computed = self::query_availability_checked($type_set, $span_from, $span_to);
            } catch (Db_Read_Failed $e) {
                // A DB read failed mid-compute. Nothing is cached, so the
                // next request retries. Return the safe direction — an empty
                // map renders as fully booked, never as falsely available.
                $age = 0;
                $hit = false;
                return [];
            }
            foreach ($missing as $ym => $key) {
                $month = [];
                foreach ($type_set as $type_id) {
                    $month[$type_id] = [];
                    foreach (($computed[$type_id] ?? []) as $date => $status) {
                        if (strncmp($date, $ym, 7) === 0) {
                            $month[$type_id][$date] = $status;
                        }
                    }
                }
                if (!self::$rules_failed) {
                    Cache::put($key, $month);
                }
                $have[$ym] = $month;
            }
            $age = 0;
        }
        $hit = !$missing;

        // The request, cut from its months. A day a month lacks (it cannot,
        // but a stored entry is data) reads as booked: never falsely open.
        $result = [];
        foreach ($room_type_ids as $type_id) {
            $result[$type_id] = [];
            for ($cursor = $from; $cursor <= $to; $cursor = $cursor->modify('+1 day')) {
                $date = $cursor->format('Y-m-d');
                $result[$type_id][$date] = $have[substr($date, 0, 7)][$type_id][$date] ?? self::ST_BOOKED;
            }
        }
        return $result;
    }

    /**
     * MOTOPRESS'S BOOKING RULES for each requested cottage and day (0.47.4),
     * as Booking_Rules::read() answers them — or null when MotoPress could
     * not be read, and the calendar then works exactly as 0.47.3 did.
     *
     * Stored the way availability is: one entry per calendar month for every
     * listed cottage, salted with today's date (the advance-booking windows
     * count from today) and the RULES generation — bumped when a rule, a
     * season, a block or a room is saved (Plugin::boot()), and not by
     * bookings, so an iCal import does not make every visitor wait for
     * MotoPress to work the rules out again. TTL 0 reads straight.
     *
     * @param int[] $room_type_ids
     * @return array<int, array{in:string, out:string, min:int[]|null, max:int[]}>|null
     */
    public static function get_rules(array $room_type_ids, DateTimeImmutable $from, DateTimeImmutable $to): ?array
    {
        $room_type_ids = array_values(array_unique(array_map('intval', $room_type_ids)));
        sort($room_type_ids);
        if (empty($room_type_ids) || $from > $to) {
            return [];
        }
        if (Cache::ttl() <= 0) {
            try {
                return Booking_Rules::read($room_type_ids, $from, $to);
            } catch (\Throwable $e) {
                Booking_Rules::failed($e);
                return null;
            }
        }
        $type_set = array_map(static fn($t) => (int) $t['id'], self::list_room_types());
        $type_set = array_values(array_unique(array_merge($type_set, $room_type_ids)));
        sort($type_set);
        $today_key = self::today()->format('Y-m-d');

        $have = [];
        $missing = [];
        for ($m = $from->modify('first day of this month'); $m <= $to; $m = $m->modify('first day of next month')) {
            $ym  = $m->format('Y-m');
            $key = Cache::rules_key(['rules_m1', $type_set, $ym, $today_key]);
            $got = Cache::peek($key);
            if (is_array($got)) {
                $have[$ym] = $got;
            } else {
                $missing[$ym] = $key;
            }
        }
        if ($missing) {
            $tz = self::timezone();
            $span_from = new DateTimeImmutable(array_key_first($missing) . '-01', $tz);
            $span_to   = (new DateTimeImmutable(array_key_last($missing) . '-01', $tz))->modify('last day of this month');
            try {
                $read = Booking_Rules::read($type_set, $span_from, $span_to);
            } catch (\Throwable $e) {
                Booking_Rules::failed($e);
                return null;
            }
            // Cut the span into its months: day i of the span is offset i.
            foreach ($missing as $ym => $key) {
                $start = (int) $span_from->diff(new DateTimeImmutable($ym . '-01', $tz))->format('%a');
                $len   = (int) (new DateTimeImmutable($ym . '-01', $tz))->format('t');
                $month = [];
                foreach ($type_set as $type_id) {
                    $r = $read[$type_id];
                    $month[$type_id] = [
                        'in'  => substr($r['in'], $start, $len),
                        'out' => substr($r['out'], $start, $len),
                        'min' => $r['min'] === null ? null : array_slice($r['min'], $start, $len),
                        'max' => array_slice($r['max'], $start, $len),
                    ];
                }
                Cache::put($key, $month);
                $have[$ym] = $month;
            }
        }

        // The request, cut from its months. A day a month lacks (it cannot,
        // but a stored entry is data) reads as the strictest answer: no
        // arrival, no departure — never a choice MotoPress would refuse.
        $out = [];
        foreach ($room_type_ids as $type_id) {
            $r = ['in' => '', 'out' => '', 'min' => [], 'max' => []];
            $no_min = false;
            for ($d = $from; $d <= $to; $d = $d->modify('+1 day')) {
                $month = $have[$d->format('Y-m')][$type_id] ?? null;
                $i = (int) $d->format('j') - 1;
                $in = is_array($month) ? substr((string) $month['in'], $i, 1) : '';
                $o  = is_array($month) ? substr((string) $month['out'], $i, 1) : '';
                $r['in']  .= $in !== '' ? $in : Booking_Rules::NOT_DAY;
                $r['out'] .= $o !== '' ? $o : Booking_Rules::NOT_DAY;
                if (!is_array($month) || $month['min'] === null) {
                    $no_min = $no_min || (is_array($month) && $month['min'] === null);
                    $r['min'][] = 1;
                } else {
                    $r['min'][] = (int) ($month['min'][$i] ?? 1);
                }
                $r['max'][] = is_array($month) ? (int) ($month['max'][$i] ?? 0) : 0;
            }
            if ($no_min) {
                $r['min'] = null;
            }
            $out[$type_id] = $r;
        }
        return $out;
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
     * Set when MotoPress's rules could not be read during a compute (0.47.4).
     * The answer is still served — it is 0.47.3's, without buffer nights —
     * but never stored, so the very next request asks MotoPress again.
     */
    private static bool $rules_failed = false;

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
    public static function find_first_availability(array $room_type_ids, DateTimeImmutable $start, ?int $max_days = null): ?DateTimeImmutable
    {
        // null, not the constant, as the default: the constant is the SHIPPED
        // value and the setting is what the site is actually running. A
        // caller that passes a number still wins, which is what the tests do.
        $max_days ??= (int) Settings::get('forward_scan_days');
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
        $room_days = self::query_occupied_room_days($rooms_of_type, $from, $to);
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
     *   - Host closures ("Booking rules → Blocks", once "Custom rules"):
     *     rows with not_stay_in = 1 — see closed_room_days().
     *
     * @param array<int,int[]> $rooms_of_type type_id => its room IDs
     * @return array<int, array<string,bool>> [ room_id => [ 'YYYY-MM-DD' => true ] ]
     */
    private static function query_occupied_room_days(array $rooms_of_type, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        global $wpdb;

        $occupied = [];
        $room_ids = [];
        foreach ($rooms_of_type as $rids) {
            foreach ($rids as $rid) {
                $room_ids[] = (int) $rid;
            }
        }
        $room_ids = array_values(array_unique($room_ids));
        if (empty($room_ids)) {
            return $occupied;
        }

        $from_str   = $from->format('Y-m-d');
        $to_str     = $to->format('Y-m-d');
        $room_ph    = implode(',', array_fill(0, count($room_ids), '%d'));

        // BUFFER DAYS (0.47.4): MotoPress keeps a room shut for N nights
        // before each booking's check-in and N after its check-out, so a
        // booking that ends just before the window, or starts just after it,
        // can still close nights inside it. Read that much further each way.
        // MotoPress unreadable: no buffers, as 0.47.3 — and this compute is
        // not stored (self::$rules_failed), so the next request retries.
        $max_buf = 0;
        try {
            $max_buf = Booking_Rules::max_buffer();
        } catch (\Throwable $e) {
            Booking_Rules::failed($e);
            self::$rules_failed = true;
        }
        $type_of_room = [];
        foreach ($rooms_of_type as $type_id => $rids) {
            foreach ($rids as $rid) {
                $type_of_room[(int) $rid] = (int) $type_id;
            }
        }

        // Error handling note: wpdb never throws — a failed query sets
        // $wpdb->last_error and returns empty, which here would silently mean
        // "no reservations" and cache every booked day as available for the
        // full TTL. Each read is therefore checked via last_error and flags
        // self::$db_error so the compute is discarded instead of cached.
        $status_ph = implode(',', array_fill(0, count(self::BLOCKING_STATUSES), '%s'));
        $sql = "SELECT rid.meta_value AS room_id, ci.meta_value AS checkin, co.meta_value AS checkout, sy.meta_value AS sync_id
                FROM {$wpdb->posts} rr
                INNER JOIN {$wpdb->postmeta} rid ON rid.post_id = rr.ID AND rid.meta_key = '_mphb_room_id'
                INNER JOIN {$wpdb->posts} bk ON bk.ID = rr.post_parent AND bk.post_type = 'mphb_booking'
                INNER JOIN {$wpdb->postmeta} ci ON ci.post_id = bk.ID AND ci.meta_key = 'mphb_check_in_date'
                INNER JOIN {$wpdb->postmeta} co ON co.post_id = bk.ID AND co.meta_key = 'mphb_check_out_date'
                LEFT JOIN {$wpdb->postmeta} sy ON sy.post_id = bk.ID AND sy.meta_key = '_mphb_sync_id'
                WHERE rr.post_type = 'mphb_reserved_room'
                  AND bk.post_status IN ($status_ph)
                  AND CAST(rid.meta_value AS UNSIGNED) IN ($room_ph)
                  AND ci.meta_value <= %s
                  AND co.meta_value > %s";
        // No ORDER BY: results are folded into a keyed map, so ordering is
        // irrelevant — and sorting them only added a filesort.
        $params = array_merge(self::BLOCKING_STATUSES, $room_ids, [
            $to->modify('+' . $max_buf . ' days')->format('Y-m-d'),
            $from->modify('-' . $max_buf . ' days')->format('Y-m-d'),
        ]);
        $rows   = $wpdb->get_results($wpdb->prepare($sql, $params));
        if ($wpdb->last_error !== '') {
            error_log('MPHBAC: reservation query failed: ' . $wpdb->last_error);
            self::$db_error = true;
        } else {
            foreach ((array) $rows as $row) {
                $rid = (int) $row->room_id;
                $ci  = (string) $row->checkin;
                $co  = (string) $row->checkout;
                // A reservation occupies nights [check_in, check_out); checkout day is free.
                self::mark_days($occupied, $rid, $ci, $co, false, $from, $to);
                if ($max_buf <= 0 || !isset($type_of_room[$rid]) || self::$rules_failed) {
                    continue;
                }
                try {
                    $n = Booking_Rules::buffer_days($type_of_room[$rid], $ci, (string) $row->sync_id !== '');
                } catch (\Throwable $e) {
                    Booking_Rules::failed($e);
                    self::$rules_failed = true;
                    continue;
                }
                if ($n > 0) {
                    // MotoPress's BookingHelper::getBookingBufferDates: the N
                    // nights before check-in and the N from check-out on.
                    try {
                        $ci_d = new DateTimeImmutable($ci, self::timezone());
                        $co_d = new DateTimeImmutable($co, self::timezone());
                    } catch (\Throwable $e) {
                        continue;
                    }
                    self::mark_days($occupied, $rid, $ci_d->modify("-$n days")->format('Y-m-d'), $ci, false, $from, $to);
                    self::mark_days($occupied, $rid, $co, $co_d->modify("+$n days")->format('Y-m-d'), false, $from, $to);
                }
            }
        }

        foreach (self::closed_rules($rooms_of_type, $room_ids, $from_str, $to_str) as $rule) {
            // Which rooms the closure covers — MotoPress's own reading
            // (BookingRulesData::getBookingRulesForDate, 6.4.0): a room, or
            // room 0 = every room of its type, or type 0 too = every room.
            if ($rule['room_id'] > 0) {
                $covered = [$rule['room_id']];
            } elseif ($rule['room_type_id'] > 0) {
                $covered = $rooms_of_type[$rule['room_type_id']] ?? [];
            } else {
                $covered = $room_ids;
            }
            foreach ($covered as $rid) {
                // Closures span [date_from, date_to], both ends included: a
                // "not stay-in" date closes that night (MotoPress's own test,
                // $date >= date_from && $date <= date_to).
                self::mark_days($occupied, (int) $rid, $rule['date_from'], $rule['date_to'], true, $from, $to);
            }
        }

        return $occupied;
    }

    /**
     * HOST CLOSURES ("not stay-in") that touch the range, for the given rooms
     * and their types (0.47.3, the WD's audit: until then only rows naming a
     * room were read, so a block for "all accommodations of a type" or "all
     * accommodations" — which MotoPress stores as room 0, and type 0 — was
     * ignored, and those dates showed as open).
     *
     * WHERE THEY LIVE (MotoPress's source, 6.4.0, read for this release):
     *   - 6.0.0 and later: the table {prefix}mphb_blocks — block_id,
     *     room_type_id, room_id, date_from, date_to (DATE, both inclusive),
     *     not_check_in, not_check_out, not_stay_in, comment. "All" is 0.
     *   - before 6.0.0: the option mphb_booking_rules_custom — rows of
     *     room_type_id, room_id, date_from, date_to and restrictions[] holding
     *     'check-in' / 'check-out' / 'stay-in'.
     * 6.0.0 COPIED the option into the table and never deleted it, so on an
     * upgraded site (this one) the option is a stale copy that no longer
     * changes. MotoPress reads the table when it exists, and so does this: the
     * option only where there is no table. Never both — a date the host has
     * since reopened must not stay closed here.
     *
     * Only not_stay_in closes a night. not_check_in / not_check_out restrict
     * arrivals and departures, which this calendar does not model (see the
     * 0.47.3 notes). {prefix}mphb_custom_booking_rules (6.0.0+) holds no
     * closure at all — per-date check-in/out permission, stay and advance
     * limits, buffer days — and is not read.
     *
     * A failed read flags the compute as untrustworthy (self::$db_error).
     *
     * @param array<int,int[]> $rooms_of_type
     * @param int[]            $room_ids
     * @return array<int, array{room_id:int, room_type_id:int, date_from:string, date_to:string}>
     */
    private static function closed_rules(array $rooms_of_type, array $room_ids, string $from_str, string $to_str): array
    {
        global $wpdb;

        $out          = [];
        $type_ids     = array_values(array_map('intval', array_keys($rooms_of_type)));
        $blocks_table = $wpdb->prefix . 'mphb_blocks';
        $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($blocks_table)));
        if ($wpdb->last_error !== '') {
            error_log('MPHBAC: blocks table check failed: ' . $wpdb->last_error);
            self::$db_error = true;
            return [];
        }
        if ($exists === $blocks_table) {
            $room_ph = implode(',', array_fill(0, count($room_ids), '%d'));
            $type_ph = implode(',', array_fill(0, max(1, count($type_ids)), '%d'));
            $sql = "SELECT room_id, room_type_id, date_from, date_to FROM $blocks_table
                     WHERE not_stay_in = 1
                       AND (room_id IN ($room_ph)
                            OR (room_id = 0 AND (room_type_id = 0 OR room_type_id IN ($type_ph))))
                       AND date_to >= %s AND date_from <= %s";
            $params = array_merge($room_ids, $type_ids ?: [0], [$from_str, $to_str]);
            $rows   = $wpdb->get_results($wpdb->prepare($sql, $params));
            if ($wpdb->last_error !== '') {
                error_log('MPHBAC: blocks query failed: ' . $wpdb->last_error);
                self::$db_error = true;
                return [];
            }
            foreach ((array) $rows as $row) {
                $out[] = [
                    'room_id'      => (int) $row->room_id,
                    'room_type_id' => (int) $row->room_type_id,
                    'date_from'    => (string) $row->date_from,
                    'date_to'      => (string) $row->date_to,
                ];
            }
            return $out;
        }

        // Before MotoPress 6.0.0: the option.
        $rules = get_option('mphb_booking_rules_custom', []);
        foreach (is_array($rules) ? $rules : [] as $rule) {
            if (!is_array($rule) || !in_array('stay-in', (array) ($rule['restrictions'] ?? []), true)) {
                continue;
            }
            $room_id = (int) ($rule['room_id'] ?? 0);
            $type_id = (int) ($rule['room_type_id'] ?? 0);
            $df = (string) ($rule['date_from'] ?? '');
            $dt = (string) ($rule['date_to'] ?? '');
            if ($df === '' || $dt === '' || $dt < $from_str || $df > $to_str) {
                continue;
            }
            if ($room_id > 0 ? !in_array($room_id, $room_ids, true) : ($type_id > 0 && !isset($rooms_of_type[$type_id]))) {
                continue;
            }
            $out[] = ['room_id' => $room_id, 'room_type_id' => $type_id, 'date_from' => $df, 'date_to' => $dt];
        }
        return $out;
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
