<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Cache
{
    public const PREFIX  = 'mphbac_';
    public const DEFAULT_TTL = 900; // 15 minutes — matches MotoPress's default iCal sync interval.

    public static function key(array $parts): string
    {
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
