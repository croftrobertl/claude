<?php
namespace MPHBSchema;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Thin WordPress-transient cache wrapper. Prefix mphbsch_; default TTL 15 min
 * (matches MotoPress's iCal sync interval).
 */
final class Cache
{
    public const PREFIX      = 'mphbsch_';
    public const DEFAULT_TTL = 900;

    /**
     * @param array<int|string,mixed> $parts
     */
    public static function key(array $parts): string
    {
        return self::PREFIX . sha1((string) wp_json_encode($parts));
    }

    /**
     * @param callable():mixed $producer
     * @return mixed
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
        $like  = $wpdb->esc_like('_transient_' . self::PREFIX) . '%';
        $tmout = $wpdb->esc_like('_transient_timeout_' . self::PREFIX) . '%';
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
            $like,
            $tmout
        ));
    }
}
