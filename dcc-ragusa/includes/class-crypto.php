<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Secrets at rest. Sodium when present (it is, on live), OpenSSL otherwise,
 * and plain text with a notice only when neither exists.
 */
final class Crypto
{
    public static function method(): string
    {
        if (function_exists('sodium_crypto_secretbox')) {
            return 'sodium';
        }
        if (function_exists('openssl_encrypt') && in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) {
            return 'openssl';
        }
        return 'plain';
    }

    public static function seal(string $plain, string $key): string
    {
        $key = self::key32($key);
        switch (self::method()) {
            case 'sodium':
                $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
                return 's1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $key));
            case 'openssl':
                $iv  = random_bytes(12);
                $tag = '';
                $ct  = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
                return 'o1:' . base64_encode($iv . $tag . (string) $ct);
            default:
                return 'p1:' . base64_encode($plain);
        }
    }

    /** Returns null when the blob cannot be opened with this key. */
    public static function open(string $blob, string $key): ?string
    {
        $key = self::key32($key);
        if (strlen($blob) < 4 || $blob[2] !== ':') {
            return null;
        }
        $kind = substr($blob, 0, 2);
        $raw  = base64_decode(substr($blob, 3), true);
        if ($raw === false) {
            return null;
        }
        try {
            if ($kind === 's1' && function_exists('sodium_crypto_secretbox_open')) {
                $n = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
                if (strlen($raw) <= $n) {
                    return null;
                }
                $out = sodium_crypto_secretbox_open(substr($raw, $n), substr($raw, 0, $n), $key);
                return $out === false ? null : $out;
            }
            if ($kind === 'o1' && function_exists('openssl_decrypt')) {
                if (strlen($raw) <= 28) {
                    return null;
                }
                $out = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
                return $out === false ? null : $out;
            }
            if ($kind === 'p1') {
                return $raw;
            }
        } catch (\Throwable $e) {
            return null;
        }
        return null;
    }

    private static function key32(string $key): string
    {
        return strlen($key) === 32 ? $key : hash('sha256', $key, true);
    }
}
