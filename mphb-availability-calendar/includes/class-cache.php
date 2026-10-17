<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Cache
{
    public const PREFIX  = 'mphbac_';
    public const DEFAULT_TTL = 900; // 15 minutes — matches MotoPress's default iCal sync interval.

    /**
     * Generation counter salted into every key. Bumping it (flush_all)
     * invalidates every entry in O(1), in the options table or an external
     * object cache alike; nothing is deleted (0.47.3).
     */
    private const GEN_OPTION = 'mphbac_cache_gen';

    /**
     * How long a computed availability answer stays good for. The constant
     * above remains the SHIPPED value — the settings schema reads it as its
     * own default, and defaults-test.php fails if the two disagree.
     */
    public static function ttl(): int
    {
        return (int) Settings::get('cache_ttl');
    }

    private static function generation(): int
    {
        return (int) get_option(self::GEN_OPTION, 1);
    }

    public static function key(array $parts): string
    {
        array_unshift($parts, self::generation());
        return self::ROW_PREFIX . sha1((string) wp_json_encode($parts));
    }

    /**
     * THE BOOKING RULES' OWN GENERATION (0.47.4). MotoPress's rules change
     * when an admin saves a rule, a season, a block or a room — not when a
     * guest books or the iCal sync imports, which is what bumps the main
     * generation several times an hour. Reading the rules is the expensive
     * part of a cold compute (MotoPress works each cottage-day out in full),
     * so they are keyed by this counter alone and survive booking changes.
     */
    private const RULES_GEN_OPTION = 'mphbac_rules_gen';

    public static function rules_key(array $parts): string
    {
        array_unshift($parts, 'rules', (int) get_option(self::RULES_GEN_OPTION, 1));
        return self::ROW_PREFIX . sha1((string) wp_json_encode($parts));
    }

    /**
     * A rule, season, block or room changed: new rules AND new availability
     * (buffer nights and closures are availability). Two O(1) bumps.
     */
    public static function flush_rules(): void
    {
        update_option(self::RULES_GEN_OPTION, (int) get_option(self::RULES_GEN_OPTION, 1) + 1, true);
        self::flush_all();
    }

    /**
     * MotoPress's rule settings, as MotoPress 6.4.0 stores them — the
     * options its own facade clears its cache on, plus the iCal "sync with
     * buffers" switch, which decides whether imported bookings carry buffer
     * nights (RoomAvailabilityHelper::getBookedDays).
     */
    public const RULE_OPTIONS = [
        'mphb_check_in_days', 'mphb_check_out_days',
        'mphb_min_stay_length', 'mphb_max_stay_length',
        'mphb_min_advance_reservation', 'mphb_max_advance_reservation',
        'mphb_buffer_days', 'mphb_booking_rules_custom',
        'mphb_do_not_apply_booking_rules_for_admin', 'mphb_ical_sync_with_buffers',
    ];

    /**
     * added_option / updated_option / deleted_option, filtered to the rule
     * settings. The generic hooks, not update_option_{name}: a rule saved for
     * the FIRST time is an add, which update_option_{name} never sees
     * (MotoPress's own facade misses that case).
     *
     * @param mixed $option
     */
    public static function flush_if_rule_option($option): void
    {
        if (is_string($option) && in_array($option, self::RULE_OPTIONS, true)) {
            self::flush_rules();
        }
    }

    /**
     * deleted_post for a season, a room or a cottage type (the post object
     * is passed, as for flush_if_booking — by now the post is gone).
     *
     * @param int           $post_id
     * @param \WP_Post|null $post
     */
    public static function flush_rules_if_rule_post($post_id, $post = null): void
    {
        if (is_object($post) && in_array($post->post_type ?? '', ['mphb_season', 'mphb_room', 'mphb_room_type'], true)) {
            self::flush_rules();
        }
    }

    /**
     * Stored payloads are wrapped as ['__v' => value, '__t' => unix_time,
     * '__e' => expiry] (see read() below) so readers can tell how old a hit is — the client uses that age to decide
     * whether the page-embedded availability is fresh enough to skip its
     * background revalidate (one fewer admin-ajax round-trip). Entries written
     * before 0.47.4 were transients under other names and are never read
     * again; WordPress's own daily clean-up removes them as they expire.
     *
     * @template T
     * @param callable():T $producer
     * @param int|null     $age  Out-param: seconds since this value was computed
     *                           (0 on a miss/fresh compute).
     * @return T
     */
    public static function get_or_set(string $key, callable $producer, ?int $ttl = null, ?int &$age = null, ?bool &$hit = null)
    {
        $ttl ??= self::ttl();
        // A TTL OF 0 MEANS "DO NOT CACHE", which is what the settings screen
        // promises. Until 0.47.4 it could not be passed through to
        // set_transient(), where 0 means the OPPOSITE — store forever; the
        // store below takes no 0 either. Handled here rather than clamped
        // away in the sanitiser, because "0 disables caching" is the useful
        // thing to be able to ask for while diagnosing stale data.
        if ($ttl <= 0) {
            $value = $producer();
            $age   = 0;
            $hit   = false;
            return $value;
        }
        $cached = self::read($key, $age);
        if ($cached !== null) {
            $hit = true; // explicit: an age of 0s does not imply a miss
            return $cached;
        }
        $value = $producer();
        $age   = 0;
        $hit   = false;
        self::write($key, $value, $ttl);
        return $value;
    }

    /**
     * Read one stored entry without computing anything (0.47.3): the value,
     * or null on a miss — and how old it is through $age. A TTL of 0 means
     * nothing is stored, so nothing is ever read either.
     *
     * @return mixed|null
     */
    public static function peek(string $key, ?int &$age = null)
    {
        $age = 0;
        if (self::ttl() <= 0) {
            return null;
        }
        return self::read($key, $age);
    }

    /** Store one entry for the setting's TTL; nothing at all when it is 0. */
    public static function put(string $key, $value): void
    {
        $ttl = self::ttl();
        if ($ttl <= 0) {
            return;
        }
        self::write($key, $value, $ttl);
    }

    /*
     * WHERE ENTRIES LIVE (0.47.4): A READ NEVER DELETES.
     *
     * Until 0.47.3 every entry was a transient. get_transient() of an EXPIRED
     * transient deletes it on the spot — two DELETEs on the options table, on
     * the visitor's request — and on 2026-10-17 at 14:48 UTC that delete met
     * a lock and deadlocked (error_log: Data_Provider::get_availability →
     * Cache::peek → get_transient → delete_option). The same expired row is
     * read by every visitor until one of them deletes it, so busy months were
     * exactly where it bit.
     *
     * Now each entry is a plain option, NOT autoloaded (it is never in
     * WordPress's every-page alloptions load), holding its own expiry:
     * ['__v' => value, '__t' => written at, '__e' => expires at]. A read
     * compares the time and answers a miss when it has passed; it never
     * deletes. The next compute overwrites the row in place (one UPDATE by
     * its unique name). Rows a generation bump or a new day leaves behind
     * are removed once a day by sweep(), off any visitor's request — see it.
     *
     * Why not a transient with no timeout: WordPress autoloads those, which
     * would put every stored month in the alloptions load of every page —
     * the bloat 0.47.3 removed.
     */
    private const ROW_PREFIX = 'mphbac_c_';

    /** @return mixed|null */
    private static function read(string $key, ?int &$age = null)
    {
        $age = 0;
        $row = get_option($key, null);
        if (!is_array($row) || !array_key_exists('__v', $row) || !isset($row['__t'], $row['__e'])) {
            return null;
        }
        $now = time();
        if ((int) $row['__e'] <= $now) {
            return null;   // expired: a miss, and the row stays for sweep()
        }
        $age = max(0, $now - (int) $row['__t']);
        return $row['__v'];
    }

    private static function write(string $key, $value, int $ttl): void
    {
        $now = time();
        update_option($key, ['__v' => $value, '__t' => $now, '__e' => $now + $ttl], false);
    }

    /**
     * THE DAILY CLEAN-UP (0.47.4). Runs on WordPress's own daily events —
     * delete_expired_transients and wp_scheduled_delete — so this plugin
     * schedules nothing and writes nothing on activation. Each expired or
     * unreadable row is deleted BY NAME, one at a time (a unique-key delete,
     * no range lock), at most $limit per run; the read that finds them is a
     * plain SELECT. A day's leftovers are a few hundred rows at most: one per
     * month asked for, per cache generation, per day.
     */
    public static function sweep(int $limit = 2000): int
    {
        global $wpdb;
        if (!is_object($wpdb) || !isset($wpdb->options)) {
            return 0;
        }
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s LIMIT %d",
            $wpdb->esc_like(self::ROW_PREFIX) . '%',
            $limit
        ));
        $now = time();
        $deleted = 0;
        foreach ((array) $rows as $row) {
            $v = maybe_unserialize($row->option_value);
            if (!is_array($v) || !isset($v['__e']) || (int) $v['__e'] <= $now) {
                delete_option((string) $row->option_name);
                $deleted++;
            }
        }
        return $deleted;
    }

    /**
     * deleted_post fires for EVERY post type; only a booking's deletion
     * changes availability. The post object is passed (WordPress 5.5+)
     * because by the time this runs the post is gone and get_post_type()
     * would answer false. The iCal sync removes bookings with
     * wp_delete_post(), permanently, so this is the only signal it gives.
     *
     * @param int           $post_id
     * @param \WP_Post|null $post
     */
    public static function flush_if_booking($post_id, $post = null): void
    {
        if (is_object($post) && ($post->post_type ?? '') === 'mphb_booking') {
            self::flush_all();
        }
    }

    public static function flush_all(): void
    {
        // O(1) invalidation that works even when transients live in an
        // external object cache: bumping the generation changes every key()
        // result, so old entries are simply never read again.
        //
        // NO DELETE ANY MORE (0.47.3, the WD's audit). Until 0.47.2 this also
        // ran `DELETE FROM options WHERE option_name LIKE '_transient_mphbac_%'`
        // on every booking save, iCal change and Elementor save — a range
        // scan and lock on the options table, which met lock conflicts on
        // live twice (error_log, Sep 18 and Sep 28). The entries the old
        // generation leaves behind carry their own expiry (the cache TTL, 15
        // minutes by default) and are removed by sweep(), once a day (since
        // 0.47.4; a read never deletes). Their number is bounded: one entry
        // per calendar month the public calendar can be asked for
        // (Data_Provider::get_availability), not one per request.
        update_option(self::GEN_OPTION, self::generation() + 1, true);
    }
}
