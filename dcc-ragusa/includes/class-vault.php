<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Revelin's store: ~/ragusa-vault/<site id>/, outside the web root, keyed
 * by site so staging never touches the live vault. A manifest of SHA-256
 * hashes signed with an HMAC, a 300 MB hard cap, oldest pre-update plugin
 * copies evicted first, and the guard copies never evicted.
 */
final class Vault
{
    public const CAP             = 300 * 1024 * 1024;
    public const QUARANTINE_DAYS = 90;
    public const KEY_CONSTANT    = 'DCC_RAGUSA_VAULT_KEY';

    public const PROTECTED_KINDS = ['guard', 'htaccess-block', 'self', 'baseline'];

    private static ?string $dir       = null;
    private static ?string $key       = null;
    private static ?array  $manifest  = null;
    private static         $lock_fh   = null;
    private static bool    $lock_opt  = false;

    // --------------------------------------------------------------- paths

    /** The vault directory for this site, created on first use. */
    public static function dir(): string
    {
        if (self::$dir !== null) {
            return self::$dir;
        }
        $home = Site::home_dir();
        $dir  = null;
        if ($home !== null) {
            $candidate = $home . '/ragusa-vault/' . Site::id();
            if (self::make_dir($candidate)) {
                $dir = $candidate;
            }
        }
        if ($dir === null) {
            $candidate = Site::uploads_dir() . '/ragusa-vault/' . Site::id();
            if (self::make_dir($candidate)) {
                $dir = $candidate;
                self::protect_web_dir(dirname($candidate));
            }
        }
        if ($dir === null) {
            $dir = sys_get_temp_dir() . '/ragusa-vault-' . Site::id();
            self::make_dir($dir);
        }
        foreach (['guards', 'plugins', 'quarantine', 'checksums', 'index', 'feed', 'self', 'baseline', 'staging'] as $sub) {
            self::make_dir($dir . '/' . $sub);
        }
        self::$dir = $dir;
        return $dir;
    }

    public static function in_web_root(): bool
    {
        return str_starts_with(self::dir(), Site::abspath() . '/');
    }

    private static function make_dir(string $dir): bool
    {
        if (is_dir($dir)) {
            return is_writable($dir);
        }
        return @mkdir($dir, 0700, true) && is_writable($dir);
    }

    private static function protect_web_dir(string $dir): void
    {
        $ht = $dir . '/.htaccess';
        if (!file_exists($ht)) {
            @file_put_contents($ht, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
        }
        $ix = $dir . '/index.php';
        if (!file_exists($ix)) {
            @file_put_contents($ix, "<?php\n// Silence is golden.\n");
        }
    }

    /** True for a path that belongs to the vault (never walked, never quarantined). */
    public static function owns(string $abs): bool
    {
        $dir = self::dir();
        return $abs === $dir || str_starts_with($abs, $dir . '/')
            || str_contains($abs, '/ragusa-vault/');
    }

    // ----------------------------------------------------------------- key

    /** 32 bytes. A wp-config.php constant wins over the key file. */
    public static function key(): string
    {
        if (self::$key !== null) {
            return self::$key;
        }
        if (defined(self::KEY_CONSTANT) && is_string(constant(self::KEY_CONSTANT)) && strlen(constant(self::KEY_CONSTANT)) >= 16) {
            self::$key = hash('sha256', constant(self::KEY_CONSTANT), true);
            return self::$key;
        }
        $file = self::dir() . '/.key';
        if (is_readable($file)) {
            $raw = (string) file_get_contents($file);
            if (strlen($raw) === 64 && ctype_xdigit($raw)) {
                self::$key = (string) hex2bin($raw);
                return self::$key;
            }
        }
        $key = random_bytes(32);
        @file_put_contents($file, bin2hex($key), LOCK_EX);
        @chmod($file, 0600);
        self::$key = $key;
        return $key;
    }

    public static function key_source(): string
    {
        return defined(self::KEY_CONSTANT) ? 'wp-config.php' : '.key';
    }

    // ------------------------------------------------------------ manifest

    public static function manifest(): array
    {
        if (self::$manifest !== null) {
            return self::$manifest;
        }
        $file = self::dir() . '/manifest.json';
        $data = ['version' => 1, 'updated' => 0, 'entries' => []];
        if (is_readable($file)) {
            $json = (string) file_get_contents($file);
            $dec  = json_decode($json, true);
            if (is_array($dec) && isset($dec['entries']) && is_array($dec['entries'])) {
                $data = $dec;
            }
        }
        self::$manifest = $data;
        return $data;
    }

    public static function hmac(string $json): string
    {
        return hash_hmac('sha256', $json, self::key());
    }

    /** True when the manifest's signature matches (or no manifest exists yet). */
    public static function verify_manifest(): bool
    {
        $file = self::dir() . '/manifest.json';
        $sig  = self::dir() . '/manifest.hmac';
        if (!file_exists($file)) {
            return true;
        }
        if (!is_readable($sig)) {
            return false;
        }
        $json = (string) file_get_contents($file);
        return hash_equals(self::hmac($json), trim((string) file_get_contents($sig)));
    }

    public static function save_manifest(array $manifest): void
    {
        $manifest['updated'] = time();
        $json                = (string) wp_json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $file                = self::dir() . '/manifest.json';
        self::write_atomic($file, $json);
        self::write_atomic(self::dir() . '/manifest.hmac', self::hmac($json) . "\n");
        self::$manifest = $manifest;
        State::set('vault_witness', substr(self::hmac($json), 0, 16));
    }

    public static function write_atomic(string $file, string $content): bool
    {
        $tmp = $file . '.tmp-' . bin2hex(random_bytes(3));
        if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
            return false;
        }
        @chmod($tmp, 0600);
        if (!@rename($tmp, $file)) {
            @unlink($tmp);
            return false;
        }
        return true;
    }

    // ------------------------------------------------------------- entries

    public static function entry(string $id): ?array
    {
        return self::manifest()['entries'][$id] ?? null;
    }

    /** @return array<string,array> id => entry, newest first */
    public static function entries(?string $kind = null, ?string $label = null): array
    {
        $out = [];
        foreach (self::manifest()['entries'] as $id => $e) {
            if ($kind !== null && ($e['kind'] ?? '') !== $kind) {
                continue;
            }
            if ($label !== null && ($e['label'] ?? '') !== $label) {
                continue;
            }
            $out[$id] = $e;
        }
        uasort($out, static fn($a, $b) => ($b['sealed_at'] ?? 0) <=> ($a['sealed_at'] ?? 0));
        return $out;
    }

    public static function latest(string $kind, string $label): ?array
    {
        $all = self::entries($kind, $label);
        return $all === [] ? null : reset($all);
    }

    public static function path(array $entry): string
    {
        return self::dir() . '/' . ltrim((string) $entry['rel'], '/');
    }

    /** The entry's file still exists and still hashes to the manifest value. */
    public static function entry_intact(array $entry): bool
    {
        $path = self::path($entry);
        return is_file($path) && hash_file('sha256', $path) === ($entry['sha256'] ?? '');
    }

    private static function new_id(string $kind, string $label): string
    {
        return $kind . '-' . Text::slug($label, 32) . '-' . gmdate('Ymd-His') . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    }

    /**
     * Seal a single file. Guard copies are "protected": never evicted. A
     * second seal of the same label replaces the previous copy.
     */
    public static function seal_file(string $kind, string $label, string $source, array $meta = []): ?array
    {
        if (!is_file($source) || !is_readable($source)) {
            return null;
        }
        $id   = self::new_id($kind, $label);
        $rel  = $kind === 'self' ? 'self/' . $id . '.copy' : $kind . 's/' . $id . '.copy';
        if ($kind === 'htaccess-block' || $kind === 'baseline') {
            $rel = $kind . '/' . $id . '.copy';
            self::make_dir(self::dir() . '/' . $kind);
        }
        $dest = self::dir() . '/' . $rel;
        if (!@copy($source, $dest)) {
            return null;
        }
        @chmod($dest, 0600);
        $entry = [
            'id'        => $id,
            'kind'      => $kind,
            'label'     => $label,
            'rel'       => $rel,
            'sha256'    => (string) hash_file('sha256', $dest),
            'size'      => (int) filesize($dest),
            'sealed_at' => time(),
            'source'    => Site::rel($source),
            'version'   => (string) ($meta['version'] ?? ''),
            'protected' => in_array($kind, self::PROTECTED_KINDS, true),
            'meta'      => $meta,
        ];
        self::replace_label($kind, $label, $entry);
        return $entry;
    }

    /** Seal a string (the .htaccess block). */
    public static function seal_text(string $kind, string $label, string $content, array $meta = []): ?array
    {
        $tmp = self::dir() . '/.seal-' . bin2hex(random_bytes(3));
        if (@file_put_contents($tmp, $content) === false) {
            return null;
        }
        $entry = self::seal_file($kind, $label, $tmp, $meta);
        @unlink($tmp);
        if ($entry !== null) {
            $entry['source'] = (string) ($meta['source'] ?? $label);
            $m                                   = self::manifest();
            $m['entries'][$entry['id']]['source'] = $entry['source'];
            self::save_manifest($m);
        }
        return $entry;
    }

    /**
     * Seal a directory as a zip (ZipArchive, else PharData). Returns null,
     * with a reason in $why, when it cannot be made or cannot fit.
     */
    public static function seal_dir(string $kind, string $label, string $dir, string $version, ?string &$why = null): ?array
    {
        $why = null;
        if (!is_dir($dir)) {
            $why = 'missing';
            return null;
        }
        $id    = self::new_id($kind, $label);
        $rel   = $kind . 's/' . Text::slug($label, 32) . '/' . $id . '.zip';
        $dest  = self::dir() . '/' . $rel;
        self::make_dir(dirname($dest));

        $files = self::list_files($dir);
        $hashes = [];
        $total  = 0;
        foreach ($files as $abs => $relf) {
            $hashes[$relf] = (string) hash_file('sha256', $abs);
            $total        += (int) filesize($abs);
        }
        $zipped = self::zip_dir($dir, $dest, $files);
        if (!$zipped) {
            @unlink($dest);
            $why = 'no-archiver';
            return null;
        }
        $size = (int) filesize($dest);
        if (!self::make_room($size, $kind)) {
            @unlink($dest);
            $why = 'too-big';
            return null;
        }
        $sidecar = $dest . '.files.json';
        self::write_atomic($sidecar, (string) wp_json_encode($hashes));
        $entry = [
            'id'        => $id,
            'kind'      => $kind,
            'label'     => $label,
            'rel'       => $rel,
            'sha256'    => (string) hash_file('sha256', $dest),
            'size'      => $size + (int) filesize($sidecar),
            'sealed_at' => time(),
            'source'    => Site::rel($dir),
            'version'   => $version,
            'protected' => in_array($kind, self::PROTECTED_KINDS, true),
            'meta'      => [
                'files'       => count($hashes),
                'bytes'       => $total,
                'files_sha'   => (string) hash_file('sha256', $sidecar),
                'archiver'    => class_exists('ZipArchive') ? 'zip' : 'phar',
            ],
        ];
        self::replace_label($kind, $label, $entry);
        return $entry;
    }

    /** Previous copies with this kind+label are removed: one version each. */
    private static function replace_label(string $kind, string $label, array $entry): void
    {
        $m = self::manifest();
        foreach ($m['entries'] as $id => $e) {
            if (($e['kind'] ?? '') === $kind && ($e['label'] ?? '') === $label) {
                self::unlink_entry($e);
                unset($m['entries'][$id]);
            }
        }
        $m['entries'][$entry['id']] = $entry;
        self::save_manifest($m);
    }

    private static function unlink_entry(array $e): void
    {
        $path = self::path($e);
        @unlink($path);
        @unlink($path . '.files.json');
        $parent = dirname($path);
        if (is_dir($parent) && count((array) scandir($parent)) === 2) {
            @rmdir($parent);
        }
    }

    public static function remove(string $id): bool
    {
        $m = self::manifest();
        if (!isset($m['entries'][$id])) {
            return false;
        }
        self::unlink_entry($m['entries'][$id]);
        unset($m['entries'][$id]);
        self::save_manifest($m);
        return true;
    }

    /** @return array<string,string> abs => relative path, sorted */
    public static function list_files(string $dir): array
    {
        $out = [];
        $dir = rtrim($dir, '/');
        $it  = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );
        foreach ($it as $f) {
            if ($f->isFile()) {
                $abs       = $f->getPathname();
                $out[$abs] = substr($abs, strlen($dir) + 1);
            }
        }
        ksort($out);
        return $out;
    }

    private static function zip_dir(string $dir, string $dest, array $files): bool
    {
        if (class_exists('ZipArchive')) {
            $zip = new \ZipArchive();
            if ($zip->open($dest, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
                return false;
            }
            foreach ($files as $abs => $rel) {
                $zip->addFile($abs, $rel);
            }
            return $zip->close();
        }
        if (class_exists('PharData')) {
            try {
                $phar = new \PharData($dest);
                foreach ($files as $abs => $rel) {
                    $phar->addFile($abs, $rel);
                }
                return true;
            } catch (\Throwable $e) {
                return false;
            }
        }
        return false;
    }

    /** Extract a sealed zip to a directory. Returns false on any failure. */
    public static function extract(array $entry, string $to): bool
    {
        $zip = self::path($entry);
        if (!self::entry_intact($entry)) {
            return false;
        }
        if (!self::make_dir($to)) {
            return false;
        }
        if (class_exists('ZipArchive')) {
            $z = new \ZipArchive();
            if ($z->open($zip) !== true) {
                return false;
            }
            $ok = $z->extractTo($to);
            $z->close();
            return (bool) $ok;
        }
        if (class_exists('PharData')) {
            try {
                (new \PharData($zip))->extractTo($to, null, true);
                return true;
            } catch (\Throwable $e) {
                return false;
            }
        }
        return false;
    }

    /** Compare an extracted directory against the sealed file hashes. */
    public static function verify_extracted(array $entry, string $dir): bool
    {
        $sidecar = self::path($entry) . '.files.json';
        if (!is_readable($sidecar) || hash_file('sha256', $sidecar) !== ($entry['meta']['files_sha'] ?? '')) {
            return false;
        }
        $expected = json_decode((string) file_get_contents($sidecar), true);
        if (!is_array($expected)) {
            return false;
        }
        $actual = self::list_files($dir);
        if (count($actual) !== count($expected)) {
            return false;
        }
        foreach ($actual as $abs => $rel) {
            if (!isset($expected[$rel]) || hash_file('sha256', $abs) !== $expected[$rel]) {
                return false;
            }
        }
        return true;
    }

    // --------------------------------------------------------- the budget

    /** Bytes used, from the manifest plus the quarantine folder. */
    public static function usage(): int
    {
        $sum = 0;
        foreach (self::manifest()['entries'] as $e) {
            $sum += (int) ($e['size'] ?? 0);
        }
        return $sum + self::dir_size(self::dir() . '/quarantine');
    }

    public static function dir_size(string $dir): int
    {
        if (!is_dir($dir)) {
            return 0;
        }
        $sum = 0;
        foreach (self::list_files($dir) as $abs => $rel) {
            $sum += (int) filesize($abs);
        }
        return $sum;
    }

    /**
     * Make room for $needed bytes by evicting the oldest unprotected plugin
     * copies first. Returns false when it still cannot fit.
     */
    public static function make_room(int $needed, string $for_kind = 'plugin'): bool
    {
        if ($needed > self::CAP) {
            return false;
        }
        self::expire_quarantine();
        if (self::usage() + $needed <= self::CAP) {
            return true;
        }
        $m          = self::manifest();
        $candidates = [];
        foreach ($m['entries'] as $id => $e) {
            if (!empty($e['protected']) || in_array($e['kind'] ?? '', self::PROTECTED_KINDS, true)) {
                continue;
            }
            $candidates[$id] = (int) ($e['sealed_at'] ?? 0);
        }
        asort($candidates);
        foreach (array_keys($candidates) as $id) {
            self::unlink_entry($m['entries'][$id]);
            unset($m['entries'][$id]);
            self::save_manifest($m);
            Events::record(Fortress::REVELIN, Events::INFO, 'evicted', (string) $id, __('An older pre-update copy was evicted to stay inside the 300 MB vault cap.', 'dcc-ragusa'));
            if (self::usage() + $needed <= self::CAP) {
                return true;
            }
        }
        return self::usage() + $needed <= self::CAP;
    }

    // ---------------------------------------------------------- quarantine

    public static function quarantine_dir(int $journal_id): string
    {
        $dir = self::dir() . '/quarantine/' . $journal_id;
        self::make_dir($dir);
        return $dir;
    }

    /** Remove quarantine folders older than 90 days. */
    public static function expire_quarantine(): void
    {
        $root = self::dir() . '/quarantine';
        if (!is_dir($root)) {
            return;
        }
        foreach ((array) scandir($root) as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $dir = $root . '/' . $name;
            if (is_dir($dir) && filemtime($dir) < time() - self::QUARANTINE_DAYS * 86400) {
                self::rm_rf($dir);
                Events::record(Fortress::REVELIN, Events::INFO, 'quarantine-expired', $name, __('A quarantined copy older than 90 days was removed.', 'dcc-ragusa'));
            }
        }
    }

    public static function rm_rf(string $dir): void
    {
        if (!is_dir($dir)) {
            @unlink($dir);
            return;
        }
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $f) {
            $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
        }
        @rmdir($dir);
    }

    /**
     * Move a path (file or directory) into the vault. rename() first, the
     * same filesystem; copy, verify and unlink otherwise. Returns the
     * method used, or null.
     */
    public static function move_in(string $source, string $dest): ?string
    {
        self::make_dir(dirname($dest));
        if (@rename($source, $dest)) {
            return 'rename';
        }
        if (is_file($source)) {
            if (@copy($source, $dest) && hash_file('sha256', $source) === hash_file('sha256', $dest)) {
                @unlink($source);
                return 'copy';
            }
            @unlink($dest);
            return null;
        }
        if (is_dir($source)) {
            if (self::copy_dir($source, $dest)) {
                self::rm_rf($source);
                return 'copy';
            }
            self::rm_rf($dest);
            return null;
        }
        return null;
    }

    public static function copy_dir(string $from, string $to): bool
    {
        if (!self::make_dir($to)) {
            return false;
        }
        foreach (self::list_files($from) as $abs => $rel) {
            $target = $to . '/' . $rel;
            self::make_dir(dirname($target));
            if (!@copy($abs, $target)) {
                return false;
            }
        }
        return true;
    }

    // ---------------------------------------------------------------- lock

    /** Atomic lock for a tick. flock on a vault file, add_option as fallback. */
    public static function lock(int $stale_after = 600): bool
    {
        $file = self::dir() . '/.lock';
        if (function_exists('flock')) {
            $fh = @fopen($file, 'c+');
            if ($fh !== false) {
                if (@flock($fh, LOCK_EX | LOCK_NB)) {
                    self::$lock_fh = $fh;
                    self::progress();
                    return true;
                }
                // Held by someone. Stale if its progress is old, or its clock jumped.
                $raw      = trim((string) stream_get_contents($fh));
                $progress = (int) $raw;
                $age      = time() - $progress;
                if ($progress > 0 && ($age > $stale_after || $age < -3600)) {
                    // The holder is gone (flock would have refused us otherwise
                    // only while the process lives); take it over.
                    fclose($fh);
                    @unlink($file);
                    $fh = @fopen($file, 'c+');
                    if ($fh !== false && @flock($fh, LOCK_EX | LOCK_NB)) {
                        self::$lock_fh = $fh;
                        self::progress();
                        Events::record(Fortress::REVELIN, Events::INFO, 'stale-lock', 'tick', __('A stale cron lock was taken over.', 'dcc-ragusa'));
                        return true;
                    }
                }
                if ($fh !== false) {
                    fclose($fh);
                }
                return false;
            }
        }
        // Fallback: an add_option race, which fails on a duplicate.
        $existing = get_option('dcc_ragusa_lock', null);
        if (is_int($existing) || is_numeric($existing)) {
            $age = time() - (int) $existing;
            if ($age <= $stale_after && $age >= -3600) {
                return false;
            }
            delete_option('dcc_ragusa_lock');
        }
        if (!add_option('dcc_ragusa_lock', time(), '', 'no')) {
            return false;
        }
        self::$lock_opt = true;
        return true;
    }

    /** Write the holder's progress time into the lock. */
    public static function progress(): void
    {
        if (self::$lock_fh !== null) {
            ftruncate(self::$lock_fh, 0);
            rewind(self::$lock_fh);
            fwrite(self::$lock_fh, (string) time());
            fflush(self::$lock_fh);
        } elseif (self::$lock_opt) {
            update_option('dcc_ragusa_lock', time(), 'no');
        }
    }

    public static function unlock(): void
    {
        if (self::$lock_fh !== null) {
            @flock(self::$lock_fh, LOCK_UN);
            fclose(self::$lock_fh);
            self::$lock_fh = null;
        }
        if (self::$lock_opt) {
            delete_option('dcc_ragusa_lock');
            self::$lock_opt = false;
        }
    }

    public static function reset_cache(): void
    {
        self::$dir      = null;
        self::$key      = null;
        self::$manifest = null;
    }
}
