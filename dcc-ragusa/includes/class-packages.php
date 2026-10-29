<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * What an installed version ships. A file that disappears during an
 * update counts as the update's only when the new version no longer
 * ships it; this class answers "does it?" from, in order: the package the
 * upgrader actually unpacked (listed at upgrader_source_selection), the
 * checksums WordPress.org publishes for the version, core's checksums.
 * Null means nobody can say, and then the removal is a finding.
 */
final class Packages
{
    public const KEEP = 2; // manifests kept per component

    private static function dir(): string
    {
        return Vault::dir() . '/packages';
    }

    private static function file(string $kind, string $slug, string $version): string
    {
        return self::dir() . '/' . Text::slug($kind, 8) . '-' . Text::slug($slug, 64) . '-' . Text::slug($version, 32) . '.json';
    }

    private static function pending(string $kind, string $slug): string
    {
        return self::dir() . '/' . Text::slug($kind, 8) . '-' . Text::slug($slug, 64) . '.pending.json';
    }

    /** The unpacked new package, listed before it replaces the old one. */
    public static function capture(string $kind, string $slug, string $source): void
    {
        $source = rtrim($source, '/\\');
        if ($slug === '' || !is_dir($source)) {
            return;
        }
        $files = array_values(array_map('strval', Vault::list_files($source)));
        sort($files);
        if (!is_dir(self::dir())) {
            @mkdir(self::dir(), 0700, true);
        }
        Vault::write_atomic(self::pending($kind, $slug), (string) wp_json_encode(['ts' => time(), 'files' => $files]));
    }

    /** The update finished: the pending list becomes this version's manifest. */
    public static function finalize(string $kind, string $slug, string $version): bool
    {
        $pending = self::pending($kind, $slug);
        if ($version === '' || !is_file($pending)) {
            return false;
        }
        $data = json_decode((string) file_get_contents($pending), true);
        @unlink($pending);
        if (!is_array($data) || time() - (int) ($data['ts'] ?? 0) > 3600 || !is_array($data['files'] ?? null)) {
            return false; // stale: some other run's
        }
        Vault::write_atomic(self::file($kind, $slug, $version), (string) wp_json_encode(['kind' => $kind, 'slug' => $slug, 'version' => $version, 'ts' => time(), 'files' => $data['files']]));
        $mine = (array) glob(self::dir() . '/' . Text::slug($kind, 8) . '-' . Text::slug($slug, 64) . '-*.json');
        usort($mine, static fn($a, $b) => filemtime((string) $b) <=> filemtime((string) $a));
        foreach (array_slice($mine, self::KEEP) as $old) {
            @unlink((string) $old);
        }
        return true;
    }

    /** @return array<string,true>|null file (relative to the component) => true */
    public static function files(string $kind, string $slug, string $version): ?array
    {
        $f = self::file($kind, $slug, $version);
        if (!is_file($f)) {
            return null;
        }
        $data = json_decode((string) file_get_contents($f), true);
        return is_array($data['files'] ?? null) ? array_fill_keys(array_map('strval', $data['files']), true) : null;
    }

    /** The folder a component's files live in, relative to the WordPress root ('' for core). */
    public static function prefix(string $kind, string $slug): string
    {
        return match ($kind) {
            'plugin' => 'wp-content/plugins/' . $slug . '/',
            'theme'  => 'wp-content/themes/' . $slug . '/',
            default  => '',
        };
    }

    /**
     * Does this version of the component ship this file (a path relative to
     * the WordPress root)? A path outside the component's own folder was
     * never in its package: false.
     */
    public static function ships(string $kind, string $slug, string $version, string $rel): ?bool
    {
        if ($version === '') {
            return null;
        }
        $prefix = self::prefix($kind, $slug);
        if ($kind !== 'core' && !str_starts_with($rel, $prefix)) {
            return false;
        }
        $inside = $kind === 'core' ? $rel : substr($rel, strlen($prefix));
        $files  = self::files($kind, $slug, $version);
        if ($files !== null) {
            return isset($files[$inside]);
        }
        if ($kind === 'plugin') {
            $map = Checksums::plugin($slug, $version);
            return $map === null ? null : isset($map[$inside]);
        }
        if ($kind === 'core') {
            $map = Checksums::core($version, function_exists('get_locale') ? get_locale() : 'en_US');
            return $map === null ? null : isset($map[$rel]);
        }
        return null;
    }

    /** Can Ragusa say what this version ships at all? */
    public static function known(string $kind, string $slug, string $version): bool
    {
        if (self::files($kind, $slug, $version) !== null) {
            return true;
        }
        return match ($kind) {
            'plugin' => Checksums::plugin($slug, $version) !== null,
            'core'   => Checksums::core($version, function_exists('get_locale') ? get_locale() : 'en_US') !== null,
            default  => false,
        };
    }
}
