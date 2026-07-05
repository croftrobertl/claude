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
     * @template T
     * @param callable():T $producer
     * @return T
     */
    public static function get_or_set(string $key, callable $producer, int $ttl = self::DEFAULT_TTL)
    {
        $cached = get_transient($key);
        if ($cached !== false) {
            return $cached;
        }
        $value = $producer();
        set_transient($key, $value, $ttl);
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
