<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The PHP error log, read from a remembered byte offset. The health
 * mu-plugin rotates it daily by rename() then truncation, so a file that
 * is smaller than the offset, or has a new inode, is read from the start.
 *
 * Only THIS site's logs are read. Staging lives inside live's web root, so
 * a parent directory that is itself a WordPress root is never read: that
 * is another site's log. A fatal raised by WP-CLI (a .phar location, or
 * WP-CLI's evaluated code) is an operator's, never evidence against an update.
 */
final class Error_Log
{
    public const MAX_READ = 2 * 1024 * 1024;

    /** @return string[] */
    public static function paths(): array
    {
        $root  = Site::abspath();
        $paths = [$root . '/error_log', Site::content_dir() . '/debug.log'];
        $ini   = (string) ini_get('error_log');
        if ($ini !== '' && str_starts_with($ini, '/') && !str_contains($ini, '..')) {
            $paths[] = $ini;
        }
        $parent = dirname($root);
        if ($parent !== $root && !self::is_wordpress_root($parent)) {
            $paths[] = $parent . '/error_log';
        }
        return array_values(array_unique($paths));
    }

    public static function is_wordpress_root(string $dir): bool
    {
        return is_file($dir . '/wp-load.php') || is_file($dir . '/wp-config.php');
    }

    /** @return array<string,array{size:int,inode:int}> */
    public static function snapshot(): array
    {
        $out = [];
        foreach (self::paths() as $path) {
            clearstatcache(true, $path);
            if (is_file($path)) {
                $out[$path] = ['size' => (int) filesize($path), 'inode' => (int) @fileinode($path)];
            } else {
                $out[$path] = ['size' => 0, 'inode' => 0];
            }
        }
        return $out;
    }

    /** A line written by WP-CLI itself: a .phar location or its evaluated code. */
    public static function is_cli_line(string $line): bool
    {
        return (bool) preg_match("#\\bphar://|\\.phar\\b|eval\\(\\)'d code#", $line);
    }

    /**
     * Fatal and parse errors written since the snapshot, WP-CLI's own left out.
     *
     * @return string[] up to 5 lines, each at most 300 characters
     */
    public static function new_fatals(array $snapshot): array
    {
        $found = [];
        foreach (self::paths() as $path) {
            clearstatcache(true, $path);
            if (!is_file($path) || !is_readable($path)) {
                continue;
            }
            $prev   = $snapshot[$path] ?? ['size' => 0, 'inode' => 0];
            $size   = (int) filesize($path);
            $inode  = (int) @fileinode($path);
            $offset = (int) $prev['size'];
            if ($size < $offset || ($prev['inode'] !== 0 && $inode !== 0 && $inode !== (int) $prev['inode'])) {
                $offset = 0; // rotated
            }
            if ($size <= $offset) {
                continue;
            }
            $fh = @fopen($path, 'rb');
            if ($fh === false) {
                continue;
            }
            fseek($fh, $offset);
            $chunk = (string) fread($fh, min(self::MAX_READ, $size - $offset));
            fclose($fh);
            foreach (preg_split('/\r?\n/', $chunk) ?: [] as $line) {
                if (!preg_match('/PHP (Fatal error|Parse error)|Uncaught (Error|Exception)/', $line)) {
                    continue;
                }
                if (self::is_cli_line($line)) {
                    continue;
                }
                $found[] = Text::scrub(mb_substr($line, 0, 300));
                if (count($found) >= 5) {
                    return $found;
                }
            }
        }
        return $found;
    }

    /** The time PHP stamped on a log line, "[26-Oct-2026 04:29:13 UTC]", or null. */
    public static function line_time(string $line): ?int
    {
        if (!preg_match('/^\[(\d{1,2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2})(?: ([A-Za-z_\/+:-]+))?\]/', $line, $m)) {
            return null;
        }
        try {
            $tz = new \DateTimeZone($m[2] ?? 'UTC');
        } catch (\Throwable $e) {
            $tz = new \DateTimeZone('UTC');
        }
        $d = \DateTimeImmutable::createFromFormat('d-M-Y H:i:s', $m[1], $tz);
        return $d === false ? null : $d->getTimestamp();
    }

    /** The file a "Failed opening required" / "Failed to open stream" line names, or null. */
    public static function missing_file(string $line): ?string
    {
        if (preg_match("/Failed opening required '([^']+)'/i", $line, $m)) {
            return $m[1];
        }
        if (preg_match('/(?:require|include)(?:_once)?\(([^)]+)\): Failed to open stream/i', $line, $m)) {
            return trim($m[1], "'\" ");
        }
        return null;
    }

    /** Does the fatal name a file inside this plugin's folder? */
    public static function in_plugin(string $line, string $slug): bool
    {
        return $slug !== '' && (bool) preg_match('#/plugins/' . preg_quote($slug, '#') . '/#', $line);
    }
}
