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

    /** Does the fatal name a file inside this plugin's folder? */
    public static function in_plugin(string $line, string $slug): bool
    {
        return $slug !== '' && (bool) preg_match('#/plugins/' . preg_quote($slug, '#') . '/#', $line);
    }
}
