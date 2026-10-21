<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Published checksums: core from api.wordpress.org (MD5 per file), plugins
 * from downloads.wordpress.org (SHA-256 per file). Cached in the vault per
 * version and refetched only when the version changes.
 */
final class Checksums
{
    public const TIMEOUT = 10;
    public const LIMIT   = 5 * 1024 * 1024;
    public const RETRY   = 7 * 86400;

    /** @return array<string,string>|null rel path => md5, or null when unavailable */
    public static function core(string $version, string $locale): ?array
    {
        $file = Vault::dir() . '/checksums/core-' . Text::slug($version . '-' . $locale) . '.json';
        $cached = self::read($file);
        if ($cached !== null) {
            return $cached['map'];
        }
        if (!function_exists('get_core_checksums')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }
        $map = get_core_checksums($version, $locale);
        if (!is_array($map) || $map === []) {
            self::write($file, null);
            return null;
        }
        self::write($file, $map);
        return $map;
    }

    /** @return array<string,string>|null rel path => sha256, or null when not a wordpress.org plugin version */
    public static function plugin(string $slug, string $version): ?array
    {
        $file   = Vault::dir() . '/checksums/' . Text::slug($slug) . '-' . Text::slug($version) . '.json';
        $cached = self::read($file);
        if ($cached !== null) {
            return $cached['map'];
        }
        $url  = 'https://downloads.wordpress.org/plugin-checksums/' . rawurlencode($slug) . '/' . rawurlencode($version) . '.json';
        $resp = wp_remote_get($url, ['timeout' => self::TIMEOUT, 'limit_response_size' => self::LIMIT, 'sslverify' => true]);
        if (is_wp_error($resp)) {
            // Transient: do not cache, try again next pass.
            return null;
        }
        $code = (int) wp_remote_retrieve_response_code($resp);
        if ($code !== 200) {
            self::write($file, null);
            return null;
        }
        $data = json_decode((string) wp_remote_retrieve_body($resp), true);
        if (!is_array($data) || !isset($data['files']) || !is_array($data['files'])) {
            self::write($file, null);
            return null;
        }
        $map = [];
        foreach ($data['files'] as $path => $hashes) {
            if (is_array($hashes) && isset($hashes['sha256']) && is_string($hashes['sha256'])) {
                $map[(string) $path] = strtolower($hashes['sha256']);
            }
        }
        self::write($file, $map);
        return $map === [] ? null : $map;
    }

    /** @return array{map:?array}|null */
    private static function read(string $file): ?array
    {
        if (!is_readable($file)) {
            return null;
        }
        $data = json_decode((string) file_get_contents($file), true);
        if (!is_array($data) || !array_key_exists('map', $data)) {
            return null;
        }
        if ($data['map'] === null && time() - (int) ($data['ts'] ?? 0) > self::RETRY) {
            return null;
        }
        return ['map' => $data['map']];
    }

    private static function write(string $file, ?array $map): void
    {
        Vault::write_atomic($file, (string) wp_json_encode(['ts' => time(), 'map' => $map]));
    }

    /** Drop cached sets for versions no longer installed. */
    public static function prune(array $keep_files): void
    {
        $dir = Vault::dir() . '/checksums';
        foreach ((array) glob($dir . '/*.json') as $file) {
            if (!in_array(basename($file), $keep_files, true)) {
                @unlink($file);
            }
        }
    }
}
