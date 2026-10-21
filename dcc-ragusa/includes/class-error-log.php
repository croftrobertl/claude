<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The PHP error log, read from a remembered byte offset. The health
 * mu-plugin rotates it daily by rename() then truncation, so a file that
 * is smaller than the offset, or has a new inode, is read from the start.
 */
final class Error_Log
{
    public const MAX_READ = 2 * 1024 * 1024;

    /** @return string[] */
    public static function paths(): array
    {
        return array_values(array_unique([
            Site::abspath() . '/error_log',
            dirname(Site::abspath()) . '/error_log',
            Site::content_dir() . '/debug.log',
        ]));
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

    /**
     * Fatal and parse errors written since the snapshot.
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
                if (preg_match('/PHP (Fatal error|Parse error)|Uncaught (Error|Exception)/', $line)) {
                    $found[] = Text::scrub(mb_substr($line, 0, 300));
                    if (count($found) >= 5) {
                        return $found;
                    }
                }
            }
        }
        return $found;
    }
}
