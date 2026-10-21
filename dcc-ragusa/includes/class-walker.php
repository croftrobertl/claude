<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A deterministic, resumable walk of a directory tree. Entries are visited
 * in one fixed order (directories compare with a trailing slash), so a
 * cursor of "the last path seen" resumes exactly where the last tick
 * stopped, and nothing is skipped or repeated.
 */
final class Walker
{
    /**
     * @param callable(string $rel, bool $is_dir): bool $skip  true to leave a path out
     * @return \Generator<string, string> rel => abs
     */
    public static function iterate(string $root, string $after, callable $skip): \Generator
    {
        $root = rtrim($root, '/');
        if (!is_dir($root)) {
            return;
        }
        yield from self::dir($root, '', $after, $skip);
    }

    private static function dir(string $root, string $prefix, string $after, callable $skip): \Generator
    {
        $abs = $prefix === '' ? $root : $root . '/' . $prefix;
        $names = @scandir($abs, SCANDIR_SORT_NONE);
        if ($names === false) {
            return;
        }
        $entries = [];
        foreach ($names as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $path   = $abs . '/' . $name;
            $is_dir = is_dir($path) && !is_link($path);
            $entries[] = [$is_dir ? $name . '/' : $name, $name, $is_dir];
        }
        usort($entries, static fn($a, $b) => strcmp($a[0], $b[0]));
        foreach ($entries as [$key, $name, $is_dir]) {
            $rel = $prefix === '' ? $name : $prefix . '/' . $name;
            if ($is_dir) {
                if ($after !== '' && !str_starts_with($after, $rel . '/') && strcmp($rel . '/', $after) <= 0) {
                    continue;
                }
                if ($skip($rel, true)) {
                    continue;
                }
                yield from self::dir($root, $rel, $after, $skip);
                continue;
            }
            if ($after !== '' && strcmp($rel, $after) <= 0) {
                continue;
            }
            if ($skip($rel, false)) {
                continue;
            }
            yield $rel => $root . '/' . $rel;
        }
    }
}
