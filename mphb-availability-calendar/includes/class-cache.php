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
     * invalidates every entry in O(1) even when transients live in an
     * external object cache that the SQL DELETE below can't reach.
     */
    private const GEN_OPTION = 'mphbac_cache_gen';

    private static function generation(): int
    {
        return (int) get_option(self::GEN_OPTION, 1);
    }

    public static function key(array $parts): string
    {
        array_unshift($parts, self::generation());
        return self::PREFIX . sha1((string) wp_json_encode($parts));
    }

    /**
     * Stored payloads are wrapped as ['__v' => value, '__t' => unix_time] so
     * readers can tell how old a hit is — the client uses that age to decide
     * whether the page-embedded availability is fresh enough to skip its
     * background revalidate (one fewer admin-ajax round-trip). Entries written
     * by < 0.14.0 lack the wrapper; they simply fail the shape check and get
     * recomputed once, so no key-version bump or migration is needed.
     *
     * @template T
     * @param callable():T $producer
     * @param int|null     $age  Out-param: seconds since this value was computed
     *                           (0 on a miss/fresh compute).
     * @return T
     */
    public static function get_or_set(string $key, callable $producer, int $ttl = self::DEFAULT_TTL, ?int &$age = null)
    {
        $cached = get_transient($key);
        if (is_array($cached) && array_key_exists('__v', $cached) && array_key_exists('__t', $cached)) {
            $age = max(0, time() - (int) $cached['__t']);
            return $cached['__v'];
        }
        $value = $producer();
        $age   = 0;
        set_transient($key, ['__v' => $value, '__t' => time()], $ttl);
        return $value;
    }

    public static function flush_all(): void
    {
        // O(1) invalidation that works even when transients live in an
        // external object cache (where the SQL below can't reach them):
        // bumping the generation changes every key() result, so old entries
        // are simply never read again and expire on their own TTL. The SQL
        // DELETE below remains the cleanup path that actually frees
        // options-table rows when no object cache is in play.
        update_option(self::GEN_OPTION, self::generation() + 1, true);

        global $wpdb;
        $like = $wpdb->esc_like('_transient_' . self::PREFIX) . '%';
        $like_timeout = $wpdb->esc_like('_transient_timeout_' . self::PREFIX) . '%';
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                $like,
                $like_timeout
            )
        );
    }
}
