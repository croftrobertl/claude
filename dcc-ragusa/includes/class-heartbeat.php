<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The dead man's switch: a healthchecks.io ping at the end of every healthy
 * tick, /fail when a check fails. The success body carries the witness
 * line (manifest fingerprint and vault size), an off-site record nobody on
 * this account can rewrite. The URL is a secret: never logged, never shown.
 */
final class Heartbeat
{
    public const MIN_INTERVAL = 120;

    private static bool $force = false;

    public static function force(bool $on): void
    {
        self::$force = $on;
    }

    public static function configured(): bool
    {
        return Settings::secret('heartbeat_url') !== '';
    }

    /** Returns 'sent', 'skipped' or 'failed'. */
    public static function ping(bool $ok, string $reason = ''): string
    {
        $url = Settings::secret('heartbeat_url');
        if ($url === '') {
            return 'skipped';
        }
        if (!Site::is_live() && !self::$force) {
            return 'skipped';
        }
        $last = (array) State::get('heartbeat', []);
        if (!self::$force && $ok && time() - (int) ($last['ts'] ?? 0) < self::MIN_INTERVAL) {
            return 'skipped';
        }
        $target = rtrim($url, '/') . ($ok ? '' : '/fail');
        $body   = $ok ? self::witness() : Text::scrub(mb_substr($reason, 0, 900));
        $resp   = wp_remote_post($target, [
            'timeout'     => 5,
            'body'        => $body,
            'headers'     => ['Content-Type' => 'text/plain; charset=UTF-8', 'User-Agent' => 'DCC-Ragusa/' . DCCR_VERSION],
            'redirection' => 2,
        ]);
        $code   = is_wp_error($resp) ? 0 : (int) wp_remote_retrieve_response_code($resp);
        $result = ($code >= 200 && $code < 300) ? 'sent' : 'failed';
        State::set('heartbeat', ['ts' => time(), 'ok' => $ok, 'result' => $result, 'code' => $code]);
        return $result;
    }

    public static function witness(): string
    {
        return implode("\n", [
            'ragusa ' . DCCR_VERSION,
            'site ' . Site::id(),
            'manifest ' . (string) State::get('vault_witness', '-'),
            'vault ' . Text::bytes(Vault::usage()),
            'files ' . (int) State::get('minceta.files', 0),
            'status ' . implode(',', array_map(static fn($s) => Fortress::status($s)['state'], Fortress::all())),
        ]);
    }

    public static function last(): array
    {
        return (array) State::get('heartbeat', []);
    }
}
