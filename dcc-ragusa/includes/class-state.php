<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * One autoload=no option for cursors, fortress statuses and small counters.
 * Read once per request, written once at the end (flush), bounded by the
 * fixed set of keys that use it.
 */
final class State
{
    public const OPTION = 'dcc_ragusa_state';

    private static ?array $data  = null;
    private static bool   $dirty = false;

    private static function load(): void
    {
        if (self::$data === null) {
            $raw        = get_option(self::OPTION, []);
            self::$data = is_array($raw) ? $raw : [];
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        self::load();
        return self::$data[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        self::load();
        self::$data[$key] = $value;
        self::$dirty      = true;
    }

    public static function delete(string $key): void
    {
        self::load();
        unset(self::$data[$key]);
        self::$dirty = true;
    }

    public static function flush(): void
    {
        if (self::$dirty && self::$data !== null) {
            if (get_option(self::OPTION, null) === null) {
                add_option(self::OPTION, self::$data, '', 'no');
            } else {
                update_option(self::OPTION, self::$data, 'no');
            }
            self::$dirty = false;
        }
    }

    /** Forget the in-memory copy (tests, and after another process wrote). */
    public static function reset(): void
    {
        self::$data  = null;
        self::$dirty = false;
    }
}
