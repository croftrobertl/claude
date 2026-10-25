<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Which site this is, decided from the table prefix and the URL on every
 * run, never from a stored flag. A staging copy pushed to live looks like
 * live, so it is treated as live.
 */
final class Site
{
    public const LIVE_HOST    = 'doracanalcourt.com';
    public const LIVE_PREFIX  = 'portal_';
    public const STAGE_PREFIX = 'wpstg0_';
    public const TZ           = 'America/New_York';

    public static function prefix(): string
    {
        return (string) ($GLOBALS['table_prefix'] ?? ($GLOBALS['wpdb']->prefix ?? ''));
    }

    /** @return array{0:string,1:string} host and path of home_url() */
    public static function home_parts(): array
    {
        $parts = wp_parse_url(home_url('/'));
        $host  = strtolower((string) ($parts['host'] ?? ''));
        $host  = preg_replace('/^www\./', '', $host) ?? $host;
        $path  = trim((string) ($parts['path'] ?? '/'), '/');
        return [$host, $path];
    }

    /** live | staging | other */
    public static function role(): string
    {
        [$host, $path] = self::home_parts();
        $prefix        = self::prefix();
        if ($prefix === self::STAGE_PREFIX || str_starts_with($path, 'staging')) {
            return 'staging';
        }
        if ($prefix === self::LIVE_PREFIX && $host === self::LIVE_HOST && $path === '') {
            return 'live';
        }
        return 'other';
    }

    public static function is_live(): bool
    {
        return self::role() === 'live';
    }

    public static function id(): string
    {
        $hash = hash('sha256', self::abspath() . '|' . self::prefix() . '|' . home_url('/'));
        return self::role() . '-' . substr($hash, 0, 8);
    }

    public static function abspath(): string
    {
        return rtrim(ABSPATH, '/\\');
    }

    public static function content_dir(): string
    {
        return rtrim(WP_CONTENT_DIR, '/\\');
    }

    public static function plugins_dir(): string
    {
        return rtrim(WP_PLUGIN_DIR, '/\\');
    }

    public static function mu_dir(): string
    {
        return rtrim(WPMU_PLUGIN_DIR, '/\\');
    }

    public static function uploads_dir(): string
    {
        if (function_exists('wp_upload_dir')) {
            $dir = wp_upload_dir(null, false);
            if (!empty($dir['basedir'])) {
                return rtrim((string) $dir['basedir'], '/\\');
            }
        }
        return self::content_dir() . '/uploads';
    }

    /** The account's home directory, or null when it cannot be found. */
    public static function home_dir(): ?string
    {
        $home = getenv('HOME');
        if (is_string($home) && $home !== '' && is_dir($home)) {
            return rtrim($home, '/');
        }
        if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
            $pw = @posix_getpwuid(posix_geteuid());
            if (is_array($pw) && !empty($pw['dir']) && is_dir($pw['dir'])) {
                return rtrim((string) $pw['dir'], '/');
            }
        }
        $dir = self::abspath();
        for ($i = 0; $i < 6; $i++) {
            if (basename($dir) === 'public_html') {
                return dirname($dir);
            }
            $parent = dirname($dir);
            if ($parent === $dir) {
                break;
            }
            $dir = $parent;
        }
        return null;
    }

    public static function tz(): \DateTimeZone
    {
        return new \DateTimeZone(self::TZ);
    }

    public static function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', self::tz());
    }

    /**
     * One clock everywhere: the property's, with the zone named.
     * "Oct 24, 8:16 PM EDT" (the year is added when it is not this year).
     */
    public static function stamp(int $ts): string
    {
        if ($ts <= 0) {
            return __('Never', 'dcc-ragusa');
        }
        $t    = (new \DateTimeImmutable('@' . $ts))->setTimezone(self::tz());
        $date = $t->format('Y') === self::now()->format('Y') ? $t->format('M j') : $t->format('M j, Y');
        return $date . ', ' . $t->format('g:i A T');
    }

    /** "Oct 24, 8:16 PM EDT (18 Hours Ago)". */
    public static function both(int $ts): string
    {
        if ($ts <= 0) {
            return __('Never', 'dcc-ragusa');
        }
        return self::stamp($ts) . ' (' . self::ago($ts) . ')';
    }

    /** "8:16 PM EDT Today", "Yesterday At 8:16 PM EDT", "Oct 3, 9:00 AM EDT". */
    public static function when(int $ts): string
    {
        if ($ts <= 0) {
            return __('Never', 'dcc-ragusa');
        }
        $t     = (new \DateTimeImmutable('@' . $ts))->setTimezone(self::tz());
        $now   = self::now();
        $time  = $t->format('g:i A T');
        $today = $now->format('Y-m-d');
        $yday  = $now->modify('-1 day')->format('Y-m-d');
        if ($t->format('Y-m-d') === $today) {
            /* translators: %s: time */
            return sprintf(__('%s Today', 'dcc-ragusa'), $time);
        }
        if ($t->format('Y-m-d') === $yday) {
            /* translators: %s: time */
            return sprintf(__('Yesterday At %s', 'dcc-ragusa'), $time);
        }
        return self::stamp($ts);
    }

    /** "12 Minutes Ago", "2 Hours Ago", "3 Days Ago". */
    public static function ago(int $ts): string
    {
        if ($ts <= 0) {
            return __('Never', 'dcc-ragusa');
        }
        $diff = max(0, time() - $ts);
        if ($diff < 90) {
            return __('Just Now', 'dcc-ragusa');
        }
        if ($diff < 3600) {
            $n = (int) round($diff / 60);
            /* translators: %d: minutes */
            return sprintf(_n('%d Minute Ago', '%d Minutes Ago', $n, 'dcc-ragusa'), $n);
        }
        if ($diff < 86400) {
            $n = (int) round($diff / 3600);
            /* translators: %d: hours */
            return sprintf(_n('%d Hour Ago', '%d Hours Ago', $n, 'dcc-ragusa'), $n);
        }
        $n = (int) round($diff / 86400);
        /* translators: %d: days */
        return sprintf(_n('%d Day Ago', '%d Days Ago', $n, 'dcc-ragusa'), $n);
    }

    /** A path relative to ABSPATH, or the path itself when outside it. */
    public static function rel(string $abs): string
    {
        $root = self::abspath() . '/';
        return str_starts_with($abs, $root) ? substr($abs, strlen($root)) : $abs;
    }

    public static function admin_page_url(): string
    {
        return admin_url('admin.php?page=' . Admin::SLUG);
    }
}
